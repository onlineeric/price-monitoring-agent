import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * get_price_summary computes min/max/avg/trend over a windowed slice of
 * priceRecords. We mock @price-monitor/db so the test stays hermetic and
 * focus on the windowing + trend-direction math.
 */

type Row = { price: number; currency: string | null; scrapedAt: Date | null };

const dbMock = vi.hoisted(() => {
  let rows: Row[] = [];
  // Production code: `await db.select().from(...).where(...).orderBy(...)`.
  // Make orderBy the terminal awaited method (returns a real Promise) and
  // chain the rest synchronously back to the same builder.
  const builder = {
    select: vi.fn(() => builder),
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => Promise.resolve(rows)),
  };
  return {
    builder,
    setRows: (next: Row[]) => {
      rows = next;
    },
  };
});

vi.mock("@price-monitor/db", () => ({
  db: dbMock.builder,
  priceRecords: { productId: "priceRecords.productId", scrapedAt: "priceRecords.scrapedAt", price: "p", currency: "c" },
}));

import { registerGetPriceSummary } from "./get-price-summary";

type Handler = (args: { productId: string; days?: number }) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  const fakeServer = {
    registerTool: (_name: string, _meta: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  registerGetPriceSummary(fakeServer as unknown as Parameters<typeof registerGetPriceSummary>[0]);
  if (!captured) throw new Error("Handler was not registered");
  return captured;
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  dbMock.setRows([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("get_price_summary tool", () => {
  it("returns a no-records message instead of crunching numbers on empty input", async () => {
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    expect(result.content[0]?.text).toMatch(/No price records found/);
    expect(result.isError).toBeUndefined();
  });

  it("aggregates min/max/avg as both raw cents and formatted strings, and reports the latest as `current`", async () => {
    dbMock.setRows([
      { price: 100, currency: "USD", scrapedAt: new Date("2026-01-01") },
      { price: 200, currency: "USD", scrapedAt: new Date("2026-01-02") },
      { price: 150, currency: "USD", scrapedAt: new Date("2026-01-03") },
    ]);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    const summary = JSON.parse(result.content[0]?.text ?? "{}");
    expect(summary).toMatchObject({
      productId: PRODUCT_ID,
      currentCents: 150,
      currentFormatted: "USD 1.50",
      minCents: 100,
      minFormatted: "USD 1.00",
      maxCents: 200,
      maxFormatted: "USD 2.00",
      avgCents: 150,
      avgFormatted: "USD 1.50",
      sampleCount: 3,
      currency: "USD",
    });
  });

  it("classifies the trend as 'up' when the second half averages >3% higher", async () => {
    dbMock.setRows([
      { price: 100, currency: "USD", scrapedAt: new Date("2026-01-01") },
      { price: 100, currency: "USD", scrapedAt: new Date("2026-01-02") },
      { price: 200, currency: "USD", scrapedAt: new Date("2026-01-03") },
      { price: 200, currency: "USD", scrapedAt: new Date("2026-01-04") },
    ]);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    expect(JSON.parse(result.content[0]?.text ?? "{}").trend).toBe("up");
  });

  it("classifies the trend as 'down' when the second half averages >3% lower", async () => {
    dbMock.setRows([
      { price: 200, currency: "USD", scrapedAt: new Date("2026-01-01") },
      { price: 200, currency: "USD", scrapedAt: new Date("2026-01-02") },
      { price: 100, currency: "USD", scrapedAt: new Date("2026-01-03") },
      { price: 100, currency: "USD", scrapedAt: new Date("2026-01-04") },
    ]);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    expect(JSON.parse(result.content[0]?.text ?? "{}").trend).toBe("down");
  });

  it("classifies as 'stable' when prices barely move (within ±3%)", async () => {
    dbMock.setRows([
      { price: 1000, currency: "USD", scrapedAt: new Date("2026-01-01") },
      { price: 1010, currency: "USD", scrapedAt: new Date("2026-01-02") },
      { price: 1005, currency: "USD", scrapedAt: new Date("2026-01-03") },
      { price: 1020, currency: "USD", scrapedAt: new Date("2026-01-04") },
    ]);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    expect(JSON.parse(result.content[0]?.text ?? "{}").trend).toBe("stable");
  });

  it("uses the caller's `days` when provided and surfaces it in the response", async () => {
    dbMock.setRows([{ price: 100, currency: "USD", scrapedAt: new Date("2026-01-01") }]);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID, days: 7 });
    expect(JSON.parse(result.content[0]?.text ?? "{}").windowDays).toBe(7);
  });
});
