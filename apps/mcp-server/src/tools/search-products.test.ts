import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * search_products is the agent's primary lookup tool. The handler reaches
 * into Drizzle's `db.query.products.findMany`, which is a different shape
 * from the lower-level `db.select()` chain used elsewhere — we mock that
 * specific path here.
 */

type ProductRow = {
  id: string;
  name: string | null;
  url: string;
  priceRecords: { price: number; currency: string | null }[];
};

const dbMock = vi.hoisted(() => {
  const findMany = vi.fn<() => Promise<ProductRow[]>>().mockResolvedValue([]);
  return {
    db: { query: { products: { findMany } } },
    findMany,
  };
});

vi.mock("@price-monitor/db", () => ({
  db: dbMock.db,
  priceRecords: { scrapedAt: "scrapedAt" },
  products: { name: "name" },
}));

import { registerSearchProducts } from "./search-products";

type Handler = (args: { query: string }) => Promise<{
  content: { type: string; text: string }[];
}>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  registerSearchProducts({
    registerTool: (_n: string, _m: unknown, h: Handler) => {
      captured = h;
    },
  } as unknown as Parameters<typeof registerSearchProducts>[0]);
  if (!captured) throw new Error("Handler not captured");
  return captured;
}

beforeEach(() => {
  dbMock.findMany.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search_products tool", () => {
  it("returns a friendly empty-result message when nothing matches", async () => {
    dbMock.findMany.mockResolvedValueOnce([]);
    const handler = captureHandler();
    const result = await handler({ query: "Widget" });
    expect(result.content[0]?.text).toMatch(/No products found matching "Widget"/);
  });

  it("flattens the latest price record onto each result so the agent gets it in one round-trip", async () => {
    dbMock.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Widget Pro",
        url: "https://shop/widget-pro",
        priceRecords: [{ price: 2999, currency: "USD" }],
      },
      {
        id: "p2",
        name: "Widget Mini",
        url: "https://shop/widget-mini",
        priceRecords: [], // never scraped successfully — currentPrice should be null
      },
    ]);
    const handler = captureHandler();
    const result = await handler({ query: "Widget" });
    const parsed = JSON.parse(result.content[0]?.text ?? "[]") as Array<{
      id: string;
      currentPrice: number | null;
      currency: string | null;
    }>;
    expect(parsed[0]).toEqual({
      id: "p1",
      name: "Widget Pro",
      url: "https://shop/widget-pro",
      currentPrice: 2999,
      currency: "USD",
    });
    expect(parsed[1]?.currentPrice).toBeNull();
    expect(parsed[1]?.currency).toBeNull();
  });
});
