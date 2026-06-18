import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The backfill enqueues one update-product-info job per product and is safe to
 * re-run (idempotent by construction — the job overwrites). The DB is mocked at
 * the @price-monitor/db boundary and the queue is injected, so no Postgres/Redis
 * is touched.
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  products: { id: "products.id" },
}));

import { backfillProductInfo } from "./backfill-product-info";

function mockProducts(rows: Array<{ url: string }>) {
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

describe("backfillProductInfo", () => {
  it("enqueues one update-product-info job per product, carrying its URL", async () => {
    mockProducts([{ url: "https://shop/a" }, { url: "https://shop/b" }]);
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const count = await backfillProductInfo(queue);

    expect(count).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      "update-product-info",
      expect.objectContaining({ url: "https://shop/a" }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      "update-product-info",
      expect.objectContaining({ url: "https://shop/b" }),
    );
  });

  it("enqueues nothing when there are no products", async () => {
    mockProducts([]);
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const count = await backfillProductInfo(queue);

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("is safe to re-run — a second pass just re-enqueues with no errors", async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    mockProducts([{ url: "https://shop/a" }]);
    await expect(backfillProductInfo(queue)).resolves.toBe(1);

    mockProducts([{ url: "https://shop/a" }]);
    await expect(backfillProductInfo(queue)).resolves.toBe(1);

    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});
