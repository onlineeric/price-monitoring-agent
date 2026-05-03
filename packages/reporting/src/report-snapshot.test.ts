import { describe, expect, it } from "vitest";

import { buildSnapshotItemFromRecords } from "./report-snapshot";

/**
 * buildSnapshotItemFromRecords is the pure-function core of the digest
 * pipeline. Trends/baselines are computed per-product here, so getting these
 * shapes wrong shows up as wrong numbers in every email — well worth the
 * dedicated coverage.
 */

const baseProduct = {
  id: "prod-1",
  name: "Widget",
  url: "https://example.com/widget",
  imageUrl: "https://cdn.example.com/widget.png",
  lastSuccessAt: new Date("2026-01-10T12:00:00Z"),
  lastFailedAt: null,
};

describe("buildSnapshotItemFromRecords", () => {
  const now = new Date("2026-01-15T00:00:00Z");

  it("falls back to a placeholder name when the product has none", () => {
    const item = buildSnapshotItemFromRecords({ ...baseProduct, name: null }, [], now);
    expect(item.name).toBe("Unnamed Product");
  });

  it("returns null prices and trends when there are no records", () => {
    const item = buildSnapshotItemFromRecords(baseProduct, [], now);
    expect(item.currentPrice).toBeNull();
    expect(item.currency).toBeNull();
    expect(item.vsLastCheck).toBeNull();
    expect(item.vs7dAvg).toBeNull();
    expect(item.vs30dAvg).toBeNull();
    expect(item.vs90dAvg).toBeNull();
    expect(item.vs180dAvg).toBeNull();
  });

  it("treats records[0] as the latest sample and records[1] as the previous", () => {
    // Caller hands us records ordered desc(scrapedAt) — pin that contract.
    const item = buildSnapshotItemFromRecords(
      baseProduct,
      [
        { price: 1200, currency: "USD", scrapedAt: new Date("2026-01-15T00:00:00Z") },
        { price: 1000, currency: "USD", scrapedAt: new Date("2026-01-14T00:00:00Z") },
      ],
      now,
    );
    expect(item.currentPrice).toBe(1200);
    expect(item.currency).toBe("USD");
    // (1200 - 1000) / 1000 * 100 = 20%
    expect(item.vsLastCheck).toBeCloseTo(20, 5);
  });

  it("excludes records outside the requested window from the averages", () => {
    const records = [
      { price: 2000, currency: "USD", scrapedAt: new Date("2026-01-14T00:00:00Z") }, // in 7d
      { price: 1500, currency: "USD", scrapedAt: new Date("2026-01-09T00:00:00Z") }, // in 7d
      { price: 1000, currency: "USD", scrapedAt: new Date("2025-12-20T00:00:00Z") }, // outside 7d
    ];
    const item = buildSnapshotItemFromRecords(baseProduct, records, now);
    // 7d avg = round((2000 + 1500) / 2) = 1750
    // current = 2000 -> delta = (2000 - 1750)/1750 * 100 ≈ 14.29%
    expect(item.vs7dAvg).toBeCloseTo(((2000 - 1750) / 1750) * 100, 4);
  });

  it("returns null for windows whose baseline is zero (avoids divide-by-zero)", () => {
    const item = buildSnapshotItemFromRecords(
      baseProduct,
      [
        { price: 0, currency: "USD", scrapedAt: new Date("2026-01-14T00:00:00Z") },
        { price: 0, currency: "USD", scrapedAt: new Date("2026-01-13T00:00:00Z") },
      ],
      now,
    );
    expect(item.vsLastCheck).toBeNull();
    expect(item.vs7dAvg).toBeNull();
  });

  it("ignores records whose scrapedAt is null when building the windowed averages", () => {
    const item = buildSnapshotItemFromRecords(
      baseProduct,
      [
        { price: 500, currency: "USD", scrapedAt: null },
        { price: 1000, currency: "USD", scrapedAt: new Date("2026-01-14T00:00:00Z") },
      ],
      now,
    );
    // 7d avg considers only the non-null sample → 1000
    // current = 500 (latestRecord, regardless of scrapedAt) → delta = -50%
    expect(item.vs7dAvg).toBeCloseTo(-50, 4);
  });

  it("preserves product metadata pass-through (id, url, image, lastChecked, lastFailed)", () => {
    const item = buildSnapshotItemFromRecords(baseProduct, [], now);
    expect(item.productId).toBe("prod-1");
    expect(item.url).toBe(baseProduct.url);
    expect(item.imageUrl).toBe(baseProduct.imageUrl);
    expect(item.lastChecked).toEqual(baseProduct.lastSuccessAt);
    expect(item.lastFailed).toBeNull();
  });
});
