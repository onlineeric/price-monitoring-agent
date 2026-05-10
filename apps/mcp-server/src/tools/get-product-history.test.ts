import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * get_product_history exposes a windowed slice of priceRecords (default 30
 * days, max 365). Tests pin the no-records message, the response envelope
 * shape, and the default-window behaviour.
 */

type Row = { price: number; currency: string | null; scrapedAt: Date | null };

const dbMock = vi.hoisted(() => {
  let rows: Row[] = [];
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
  priceRecords: { productId: "x", scrapedAt: "y", price: "p", currency: "c" },
}));

import { registerGetProductHistory } from "./get-product-history";

type Handler = (args: { productId: string; days?: number }) => Promise<{
  content: { type: string; text: string }[];
}>;

function captureHandler(): Handler {
  let captured: Handler | undefined;
  registerGetProductHistory({
    registerTool: (_n: string, _m: unknown, h: Handler) => {
      captured = h;
    },
  } as unknown as Parameters<typeof registerGetProductHistory>[0]);
  if (!captured) throw new Error("Handler not captured");
  return captured;
}

const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  dbMock.setRows([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("get_product_history tool", () => {
  it("returns a friendly no-records message when nothing is in the window", async () => {
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID });
    expect(result.content[0]?.text).toMatch(/No price records found/);
    expect(result.content[0]?.text).toContain(PRODUCT_ID);
    expect(result.content[0]?.text).toMatch(/30 days/);
  });

  it("uses the caller's `days` value in the no-records message when provided", async () => {
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID, days: 90 });
    expect(result.content[0]?.text).toMatch(/90 days/);
  });

  it("returns each record with cents + formatted display string so the agent never divides by 100 itself", async () => {
    const rows: Row[] = [
      { price: 1500, currency: "USD", scrapedAt: new Date("2026-01-15") },
      { price: 1400, currency: "USD", scrapedAt: new Date("2026-01-10") },
    ];
    dbMock.setRows(rows);
    const handler = captureHandler();
    const result = await handler({ productId: PRODUCT_ID, days: 30 });
    const parsed = JSON.parse(result.content[0]?.text ?? "{}") as {
      productId: string;
      days: number;
      records: Array<{ priceCents: number; priceFormatted: string; currency: string | null; scrapedAt: string }>;
    };
    expect(parsed.productId).toBe(PRODUCT_ID);
    expect(parsed.days).toBe(30);
    expect(parsed.records.length).toBe(2);
    expect(parsed.records[0]).toMatchObject({
      priceCents: 1500,
      priceFormatted: "USD 15.00",
      currency: "USD",
    });
    expect(parsed.records[1]).toMatchObject({
      priceCents: 1400,
      priceFormatted: "USD 14.00",
    });
  });
});
