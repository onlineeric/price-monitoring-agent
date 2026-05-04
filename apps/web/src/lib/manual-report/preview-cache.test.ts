import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * preview-cache mediates the manual-report preview snapshot through Redis.
 * Behaviour we lock here:
 *   - `cacheManualReportPreview` writes with the 15-minute EX TTL and a
 *     `preview_<uuid>` id so the route can hand it back to the client.
 *   - `getManualReportPreview` round-trips Date <-> ISO string for nested
 *     fields (lastChecked, lastFailed) and returns null on missing keys.
 *   - Malformed JSON or schema-mismatch payloads return null instead of
 *     throwing — that's the route's contract.
 */

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ redisConnection: redisMock }));

import { cacheManualReportPreview, getManualReportPreview } from "./preview-cache";

beforeEach(() => {
  redisMock.set.mockReset();
  redisMock.get.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleItem = {
  productId: "p1",
  name: "Widget",
  url: "https://shop/x",
  imageUrl: null,
  currentPrice: 1999,
  currency: "USD",
  lastChecked: new Date("2026-03-17T09:00:00.000Z"),
  lastFailed: null,
  vsLastCheck: null,
  vs7dAvg: null,
  vs30dAvg: null,
  vs90dAvg: null,
  vs180dAvg: null,
};

describe("cacheManualReportPreview", () => {
  it("writes the snapshot to Redis with a 15-minute EX TTL and returns a previewId", async () => {
    redisMock.set.mockResolvedValueOnce("OK");

    const snapshot = await cacheManualReportPreview({
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      subject: "Hello",
      html: "<html />",
      productCount: 1,
      items: [sampleItem],
    });

    expect(snapshot.previewId).toMatch(/^preview_/);
    expect(redisMock.set).toHaveBeenCalledTimes(1);

    const [key, payload, exFlag, ttl] = redisMock.set.mock.calls[0];
    expect(key).toBe(`manual-report:preview:${snapshot.previewId}`);
    expect(exFlag).toBe("EX");
    expect(ttl).toBe(15 * 60);

    const parsed = JSON.parse(payload as string);
    // Dates should be serialized to ISO strings so JSON round-trips cleanly.
    expect(parsed.generatedAt).toBe("2026-03-17T09:00:00.000Z");
    expect(parsed.items[0].lastChecked).toBe("2026-03-17T09:00:00.000Z");
    expect(parsed.items[0].lastFailed).toBeNull();
  });
});

describe("getManualReportPreview", () => {
  it("returns null when the key is missing", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    expect(await getManualReportPreview("preview_missing")).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    redisMock.get.mockResolvedValueOnce("{not-json");
    expect(await getManualReportPreview("preview_x")).toBeNull();
  });

  it("returns null on schema-mismatched payloads", async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ wrong: "shape" }));
    expect(await getManualReportPreview("preview_x")).toBeNull();
  });

  it("rehydrates ISO date strings back into Date objects", async () => {
    const stored = {
      previewId: "preview_x",
      generatedAt: "2026-03-17T09:00:00.000Z",
      subject: "Hello",
      html: "<html />",
      productCount: 1,
      items: [
        {
          ...sampleItem,
          lastChecked: "2026-03-17T09:00:00.000Z",
          lastFailed: null,
        },
      ],
    };
    redisMock.get.mockResolvedValueOnce(JSON.stringify(stored));

    const result = await getManualReportPreview("preview_x");

    expect(result).not.toBeNull();
    expect(result?.generatedAt).toBeInstanceOf(Date);
    expect(result?.generatedAt.toISOString()).toBe("2026-03-17T09:00:00.000Z");
    expect(result?.items[0].lastChecked).toBeInstanceOf(Date);
    expect(result?.items[0].lastFailed).toBeNull();
  });
});
