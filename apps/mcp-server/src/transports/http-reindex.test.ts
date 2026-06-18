import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the POST /internal/reindex handler (contract:
 * internal-reindex-endpoint.md). reindexProduct is mocked at the module
 * boundary; we drive the handler with a fake req (a Readable carrying the JSON
 * body) and a fake res that captures status + body. The contract under test is
 * the status-code mapping: 200 success, 400 bad body, 404 unknown product,
 * 500 on embed/DB failure (a non-2xx is what makes the worker job retry).
 */

const reindexMock = vi.hoisted(() => {
  class ProductNotFoundError extends Error {
    constructor(public readonly productId: string) {
      super(`product not found: ${productId}`);
      this.name = "ProductNotFoundError";
    }
  }
  return { reindexProduct: vi.fn(), ProductNotFoundError };
});

vi.mock("../embeddings/reindex.js", () => reindexMock);

import { handleInternalReindex } from "./http";

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

function mockReq(body: string): Readable {
  return Readable.from([body]);
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
  writableEnded: boolean;
  setHeader(name: string, value: string): void;
  on(event: string, cb: () => void): FakeRes;
  end(chunk?: string): void;
}

function mockRes(): FakeRes {
  const emitter = new EventEmitter();
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    body: "",
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    on(event, cb) {
      emitter.on(event, cb);
      return this;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
      this.headersSent = true;
      this.writableEnded = true;
      emitter.emit("finish");
    },
  };
  return res;
}

async function run(body: string): Promise<FakeRes> {
  const req = mockReq(body) as unknown as Parameters<typeof handleInternalReindex>[0];
  const res = mockRes();
  await handleInternalReindex(req, res as unknown as Parameters<typeof handleInternalReindex>[1]);
  return res;
}

beforeEach(() => {
  reindexMock.reindexProduct.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /internal/reindex handler", () => {
  it("200 { productId, chunks } on success", async () => {
    reindexMock.reindexProduct.mockResolvedValueOnce(3);
    const res = await run(JSON.stringify({ productId: VALID_ID }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ productId: VALID_ID, chunks: 3 });
    expect(reindexMock.reindexProduct).toHaveBeenCalledWith(VALID_ID);
  });

  it("400 validation_error on malformed JSON", async () => {
    const res = await run("{not json");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("validation_error");
    expect(reindexMock.reindexProduct).not.toHaveBeenCalled();
  });

  it("400 validation_error when productId is not a uuid", async () => {
    const res = await run(JSON.stringify({ productId: "nope" }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("validation_error");
    expect(reindexMock.reindexProduct).not.toHaveBeenCalled();
  });

  it("404 not_found for an unknown product", async () => {
    reindexMock.reindexProduct.mockRejectedValueOnce(new reindexMock.ProductNotFoundError(VALID_ID));
    const res = await run(JSON.stringify({ productId: VALID_ID }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe("not_found");
  });

  it("500 internal_error on embed/DB failure (so the job retries)", async () => {
    reindexMock.reindexProduct.mockRejectedValueOnce(new Error("model boom"));
    const res = await run(JSON.stringify({ productId: VALID_ID }));
    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.code).toBe("internal_error");
    expect(parsed.error.message).toContain("model boom");
  });
});
