import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * trendCalculator hits the DB to compute per-product trends used by the
 * digest email. We mock the @price-monitor/db client so the unit tests stay
 * hermetic — they verify the orchestration (per-product fan-out, ordering
 * assumptions, average windows) not Drizzle itself.
 */

type Row = { id: string; productId: string; price: number; currency: string | null; scrapedAt: Date | null };
type Product = {
  id: string;
  name: string | null;
  url: string;
  imageUrl: string | null;
  lastSuccessAt: Date | null;
  lastFailedAt: Date | null;
};

const state = vi.hoisted(() => ({
  // Production code performs two awaits per call:
  //   1) product lookup → returns Product[]
  //   2) priceRecords lookup → returns Row[]
  // We queue the responses in order so each `await` pulls the next one.
  responses: [] as unknown[][],
}));

vi.mock("@price-monitor/db", () => {
  // Each await on the chain pops the next queued response.
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    orderBy: () => Promise.resolve(state.responses.shift() ?? []),
    limit: () => Promise.resolve(state.responses.shift() ?? []),
  };
  return {
    db: builder,
    products: { id: "id", active: "active" },
    priceRecords: { productId: "productId", scrapedAt: "scrapedAt" },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: () => null,
  gte: () => null,
  and: () => null,
  desc: () => null,
}));

import { calculateTrendsForProduct } from "./trendCalculator";

beforeEach(() => {
  state.responses = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateTrendsForProduct", () => {
  it("returns null when the product is not in the database", async () => {
    state.responses = [[]]; // first await (product lookup) resolves to no rows
    const result = await calculateTrendsForProduct("missing-id");
    expect(result).toBeNull();
  });

  it("returns a populated ProductTrendData when the product and records exist", async () => {
    const product: Product = {
      id: "prod-1",
      name: "Widget",
      url: "https://shop/x",
      imageUrl: "https://cdn/x.jpg",
      lastSuccessAt: new Date("2026-01-15T00:00:00Z"),
      lastFailedAt: null,
    };
    const records: Row[] = [
      { id: "r1", productId: "prod-1", price: 1500, currency: "USD", scrapedAt: new Date("2026-01-14T00:00:00Z") },
      { id: "r2", productId: "prod-1", price: 1000, currency: "USD", scrapedAt: new Date("2026-01-13T00:00:00Z") },
    ];
    state.responses = [[product], records];

    const result = await calculateTrendsForProduct("prod-1");

    expect(result).not.toBeNull();
    expect(result?.productId).toBe("prod-1");
    expect(result?.name).toBe("Widget");
    expect(result?.currentPrice).toBe(1500);
    expect(result?.previousPrice).toBe(1000);
    expect(result?.vsLastCheck).toBeCloseTo(50, 5); // 1500 vs 1000 = +50%
    expect(result?.currency).toBe("USD");
    expect(result?.imageUrl).toBe("https://cdn/x.jpg");
  });
});
