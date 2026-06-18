import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the shared product-stats helper. The Drizzle client is mocked
 * as a thenable chainable builder: every chain method returns the builder, and
 * `await`-ing it resolves the next queued result. This handles the helper's
 * mixed query terminals (latest price ends at `.limit(1)`; history ends at
 * `.orderBy(...)`).
 */

const dbMock = vi.hoisted(() => {
  let queue: unknown[] = [];
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    // Thenable: awaiting any point in the chain pulls the next queued result.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable so `await`-ing the Drizzle chain resolves a mocked result
    then: (resolve: (value: unknown) => void) => resolve(queue.shift() ?? []),
  };
  return {
    builder,
    setQueue: (next: unknown[]) => {
      queue = next;
    },
  };
});

vi.mock("@price-monitor/db", () => ({
  db: dbMock.builder,
  products: { id: "products.id", createdAt: "products.createdAt" },
  priceRecords: { productId: "pr.productId", scrapedAt: "pr.scrapedAt", price: "pr.price", currency: "pr.currency" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __op: "and", args }),
  desc: (col: unknown) => ({ __op: "desc", col }),
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
  gte: (col: unknown, val: unknown) => ({ __op: "gte", col, val }),
}));

import { getAllProductsWithStats, getProductWithStats } from "./product-stats";

const NOW = new Date("2026-06-16T00:00:00.000Z");

function rawProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    url: "https://shop/x",
    name: "Widget",
    imageUrl: "https://img/x.png",
    active: true,
    lastSuccessAt: NOW,
    lastFailedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    description: "A widget",
    category: "Gadgets",
    brand: "Acme",
    countryOfOrigin: "NZ",
    attributes: [{ key: "Color", value: "Black" }],
    infoUpdatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  dbMock.setQueue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getProductWithStats", () => {
  it("enriches a product with its latest price and history (integer cents preserved)", async () => {
    dbMock.setQueue([
      [rawProduct()], // product-by-id
      [{ price: 58500, currency: "NZD", scrapedAt: NOW }], // latest price
      [
        { price: 60000, currency: "NZD", scrapedAt: new Date("2026-06-01T00:00:00Z") },
        { price: 58500, currency: "NZD", scrapedAt: NOW },
      ], // history
    ]);

    const result = await getProductWithStats("p1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("p1");
    expect(result?.currentPrice).toBe(58500);
    expect(result?.currency).toBe("NZD");
    expect(result?.lastChecked).toEqual(NOW);
    expect(result?.priceHistory).toEqual([
      { date: new Date("2026-06-01T00:00:00Z"), price: 60000 },
      { date: NOW, price: 58500 },
    ]);
    // 007 metadata flows through from the raw row.
    expect(result?.brand).toBe("Acme");
    expect(result?.attributes).toEqual([{ key: "Color", value: "Black" }]);
  });

  it("returns null when the product does not exist", async () => {
    dbMock.setQueue([[]]); // product-by-id → empty
    expect(await getProductWithStats("missing")).toBeNull();
  });

  it("falls back to null price and USD when there is no price record", async () => {
    dbMock.setQueue([
      [rawProduct({ name: null, imageUrl: null })],
      [], // no latest price
      [], // no history
    ]);

    const result = await getProductWithStats("p1");

    expect(result?.currentPrice).toBeNull();
    expect(result?.currency).toBe("USD");
    expect(result?.lastChecked).toBeNull();
    expect(result?.priceHistory).toEqual([]);
    // name/imageUrl coalesced.
    expect(result?.name).toBe("Unnamed Product");
    expect(result?.imageUrl).toBeNull();
  });

  it("drops history rows with a null scrapedAt", async () => {
    dbMock.setQueue([
      [rawProduct()],
      [{ price: 100, currency: "USD", scrapedAt: NOW }],
      [
        { price: 100, currency: "USD", scrapedAt: null },
        { price: 100, currency: "USD", scrapedAt: NOW },
      ],
    ]);

    const result = await getProductWithStats("p1");
    expect(result?.priceHistory).toEqual([{ date: NOW, price: 100 }]);
  });
});

describe("getAllProductsWithStats", () => {
  it("maps every product through the same enrichment", async () => {
    dbMock.setQueue([
      [rawProduct({ id: "p1" })], // all products (one row)
      [{ price: 999, currency: "USD", scrapedAt: NOW }], // latest for p1
      [{ price: 999, currency: "USD", scrapedAt: NOW }], // history for p1
    ]);

    const result = await getAllProductsWithStats();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
    expect(result[0].currentPrice).toBe(999);
  });
});
