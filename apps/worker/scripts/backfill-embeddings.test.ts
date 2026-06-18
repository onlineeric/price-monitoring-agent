import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The embeddings backfill enqueues one reindex job per product and is safe to
 * re-run (idempotency rides on the endpoint's delete-and-replace — FR-017). The
 * DB is mocked at the @price-monitor/db boundary and the queue is injected, so
 * no Postgres/Redis is touched.
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  products: { id: "products.id" },
}));

import { backfillEmbeddings } from "./backfill-embeddings";

function mockProducts(rows: Array<{ id: string }>) {
  const from = vi.fn().mockResolvedValue(rows);
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  dbMock.select.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backfillEmbeddings", () => {
  it("enqueues exactly one reindex job per product, carrying its id + retry opts", async () => {
    mockProducts([{ id: "p1" }, { id: "p2" }]);
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const count = await backfillEmbeddings(queue);

    expect(count).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      "reindex-product-embeddings",
      { productId: "p1" },
      expect.objectContaining({ attempts: 5, backoff: { type: "exponential", delay: 5000 } }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      "reindex-product-embeddings",
      { productId: "p2" },
      expect.anything(),
    );
  });

  it("enqueues nothing when there are no products", async () => {
    mockProducts([]);
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const count = await backfillEmbeddings(queue);

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("produces the same job set on a second run (idempotent re-run)", async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    mockProducts([{ id: "p1" }]);
    await expect(backfillEmbeddings(queue)).resolves.toBe(1);

    mockProducts([{ id: "p1" }]);
    await expect(backfillEmbeddings(queue)).resolves.toBe(1);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(1, "reindex-product-embeddings", { productId: "p1" }, expect.anything());
    expect(queue.add).toHaveBeenNthCalledWith(2, "reindex-product-embeddings", { productId: "p1" }, expect.anything());
  });
});
