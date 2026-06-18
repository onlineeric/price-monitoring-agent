import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * add_product is the only mutating tool the agent exposes. It must be
 * idempotent: re-adding the same URL returns the existing row instead of
 * spamming an update-product-info job. We mock both the db chain and the
 * BullMQ queue to verify the two branches.
 */

const state = vi.hoisted(() => ({
  insertReturning: [] as Array<{ id: string }>,
  selectLimit: [] as Array<{ id: string; name: string | null; active: boolean }>,
}));

const queueMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@price-monitor/db", () => {
  const insertChain = {
    values() {
      return insertChain;
    },
    onConflictDoNothing() {
      return insertChain;
    },
    async returning() {
      return state.insertReturning;
    },
  };
  const selectChain = {
    from() {
      return selectChain;
    },
    where() {
      return selectChain;
    },
    async limit() {
      return state.selectLimit;
    },
  };
  return {
    db: {
      insert: () => insertChain,
      select: () => selectChain,
    },
    eq: (..._args: unknown[]) => null,
    products: { id: "id", name: "name", url: "url", active: "active" },
  };
});

vi.mock("../queue.js", () => ({
  getPriceQueue: () => queueMock,
}));

import { registerAddProduct } from "./add-product";

type Handler = (args: { url: string }) => Promise<{
  content: { type: string; text: string }[];
}>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  registerAddProduct({
    registerTool: (_n: string, _m: unknown, h: Handler) => {
      captured = h;
    },
  } as unknown as Parameters<typeof registerAddProduct>[0]);
  if (!captured) throw new Error("Handler not captured");
  return captured;
}

beforeEach(() => {
  state.insertReturning = [];
  state.selectLimit = [];
  queueMock.add.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("add_product tool", () => {
  it("inserts the product, enqueues an update-product-info job, and reports status='queued' for new URLs", async () => {
    state.insertReturning = [{ id: "new-1" }];
    queueMock.add.mockResolvedValueOnce({ id: "job-1" });

    const handler = captureHandler();
    const result = await handler({ url: "https://shop/new" });
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.status).toBe("queued");
    expect(parsed.productId).toBe("new-1");
    expect(parsed.jobId).toBe("job-1");
    // Must match the UI add flow: enqueue a full metadata+price refresh, not a
    // price-only check-price — otherwise chat-added products start with no
    // metadata and are invisible to semantic_search_products.
    expect(queueMock.add).toHaveBeenCalledWith(
      "update-product-info",
      expect.objectContaining({ url: "https://shop/new" }),
    );
  });

  it("returns status='already_monitoring' (no new job) when the URL is already tracked", async () => {
    state.insertReturning = []; // ON CONFLICT DO NOTHING returned no row
    state.selectLimit = [{ id: "existing-1", name: "Widget", active: true }];

    const handler = captureHandler();
    const result = await handler({ url: "https://shop/exists" });

    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.status).toBe("already_monitoring");
    expect(parsed.productId).toBe("existing-1");
    expect(parsed.name).toBe("Widget");
    expect(parsed.active).toBe(true);
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it("still returns the already_monitoring envelope (with nulls) if the lookup misses", async () => {
    state.insertReturning = [];
    state.selectLimit = [];

    const handler = captureHandler();
    const result = await handler({ url: "https://shop/odd" });
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.status).toBe("already_monitoring");
    expect(parsed.productId).toBeNull();
    expect(parsed.name).toBeNull();
    expect(queueMock.add).not.toHaveBeenCalled();
  });
});
