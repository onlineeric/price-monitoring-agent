import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * reindexEmbeddings is a thin, model-free HTTP bridge to the mcp-server's
 * internal reindex endpoint. The contract: a non-2xx or a network error must
 * THROW (so BullMQ retries with backoff), and a 2xx resolves while logging the
 * chunk count. We mock config (to avoid the real Redis connection) and fetch.
 */

vi.mock("../config.js", () => ({
  MCP_REINDEX_URL: "http://mcp-test:3002/internal/reindex",
}));

import reindexEmbeddingsJob from "./reindexEmbeddings";

function makeJob(productId: string, id = "job-1"): Job<{ productId: string }> {
  return { id, data: { productId } } as unknown as Job<{ productId: string }>;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reindexEmbeddingsJob", () => {
  it("POSTs the productId to MCP_REINDEX_URL and resolves with the chunk count on 2xx", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ productId: "p1", chunks: 4 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await reindexEmbeddingsJob(makeJob("p1"));

    expect(result).toEqual({ productId: "p1", chunks: 4 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://mcp-test:3002/internal/reindex",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ productId: "p1" }),
      }),
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("chunks=4"));
  });

  it("throws on a non-2xx response (so BullMQ retries)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })),
    );

    await expect(reindexEmbeddingsJob(makeJob("p1"))).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a network error (so BullMQ retries)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(reindexEmbeddingsJob(makeJob("p1"))).rejects.toThrow(/ECONNREFUSED/);
  });
});
