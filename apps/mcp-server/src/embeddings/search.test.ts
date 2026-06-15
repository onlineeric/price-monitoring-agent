import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * semanticSearch composes a DISTINCT ON (best chunk per product) inner query
 * with an outer order-by-distance + top-N, then a metadata/price fetch. The
 * dedup, threshold, and ordering live in SQL, so we mock the Drizzle chain and
 * the embedding provider and assert the *contract*: the cutoff goes through a
 * WHERE, dedup is DISTINCT ON product_id, top-N is the LIMIT, the mapping
 * preserves nearest-first order and attaches the latest price + matched chunk,
 * and an empty match set returns `[]` (never an error).
 */

const DIM = 384;

const providerMock = vi.hoisted(() => ({
  embedQuery: vi.fn(async () => Array.from({ length: 384 }, () => 0.1)),
}));

const configMock = vi.hoisted(() => ({
  getEmbeddingConfig: vi.fn(() => ({
    provider: "local" as const,
    model: "Xenova/all-MiniLM-L6-v2",
    cacheDir: undefined,
    topN: 5,
    maxDistance: 0.55,
  })),
}));

const dbMock = vi.hoisted(() => {
  // Outer select chain: select().from().orderBy().limit() => matches
  const limit = vi.fn();
  const outerOrderBy = vi.fn(() => ({ limit }));
  const outerFrom = vi.fn(() => ({ orderBy: outerOrderBy }));
  const select = vi.fn(() => ({ from: outerFrom }));

  // Inner distinct-on chain: selectDistinctOn().from().where().orderBy().as()
  const asFn = vi.fn(() => ({
    productId: "best.productId",
    content: "best.content",
    distance: "best.distance",
  }));
  const innerOrderBy = vi.fn(() => ({ as: asFn }));
  const where = vi.fn(() => ({ orderBy: innerOrderBy }));
  const innerFrom = vi.fn(() => ({ where }));
  const selectDistinctOn = vi.fn((..._args: unknown[]) => ({ from: innerFrom }));

  const findMany = vi.fn();

  return {
    limit,
    where,
    select,
    selectDistinctOn,
    findMany,
    db: {
      select,
      selectDistinctOn,
      query: { products: { findMany } },
    },
  };
});

vi.mock("./provider.js", () => providerMock);
vi.mock("../config.js", () => configMock);
vi.mock("@price-monitor/db", () => ({
  db: dbMock.db,
  productEmbeddings: { embedding: { name: "embedding" }, productId: { name: "product_id" }, content: { name: "content" } },
  products: { id: { name: "id" } },
  priceRecords: { scrapedAt: { name: "scraped_at" } },
}));

import { semanticSearch } from "./search";

function productRow(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    name: `Product ${id}`,
    url: `https://shop/${id}`,
    brand: "Acme",
    category: "Monitors",
    countryOfOrigin: "Taiwan",
    description: "desc",
    attributes: [{ key: "Refresh rate", value: "165 Hz" }],
    priceRecords: [{ price: 58500, currency: "NZD" }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // re-apply default config (clearAllMocks wipes the implementation)
  configMock.getEmbeddingConfig.mockReturnValue({
    provider: "local",
    model: "Xenova/all-MiniLM-L6-v2",
    cacheDir: undefined,
    topN: 5,
    maxDistance: 0.55,
  });
  providerMock.embedQuery.mockResolvedValue(Array.from({ length: DIM }, () => 0.1));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("semanticSearch", () => {
  it("returns [] (not an error) when nothing is within the cutoff / index is empty", async () => {
    dbMock.limit.mockResolvedValueOnce([]);
    const results = await semanticSearch("recommend a hiking trail");
    expect(results).toEqual([]);
    // no metadata fetch when there are no matches
    expect(dbMock.findMany).not.toHaveBeenCalled();
  });

  it("dedups to the best chunk per product via DISTINCT ON product_id", async () => {
    dbMock.limit.mockResolvedValueOnce([]);
    await semanticSearch("anything");
    expect(dbMock.selectDistinctOn).toHaveBeenCalledTimes(1);
    const onCols = dbMock.selectDistinctOn.mock.calls[0]?.[0];
    expect(onCols).toEqual([{ name: "product_id" }]);
  });

  it("maps matches to distinct products nearest-first, attaching latest price + matched chunk", async () => {
    // Matches already ordered by distance asc (p2 nearer than p1).
    dbMock.limit.mockResolvedValueOnce([
      { productId: "p2", content: "best chunk for p2", distance: 0.12 },
      { productId: "p1", content: "best chunk for p1", distance: 0.34 },
    ]);
    // findMany returns rows in arbitrary order — the mapping must re-sort.
    dbMock.findMany.mockResolvedValueOnce([productRow("p1"), productRow("p2")]);

    const results = await semanticSearch("a gaming monitor for editing");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(results[0]).toMatchObject({
      id: "p2",
      name: "Product p2",
      url: "https://shop/p2",
      brand: "Acme",
      category: "Monitors",
      countryOfOrigin: "Taiwan",
      description: "desc",
      attributes: [{ key: "Refresh rate", value: "165 Hz" }],
      currentPriceCents: 58500,
      currency: "NZD",
      matchedChunk: "best chunk for p2",
      distance: 0.12,
    });
  });

  it("yields null price fields for a product that was never scraped", async () => {
    dbMock.limit.mockResolvedValueOnce([{ productId: "p1", content: "c", distance: 0.2 }]);
    dbMock.findMany.mockResolvedValueOnce([productRow("p1", { priceRecords: [] })]);

    const [result] = await semanticSearch("x");
    expect(result?.currentPriceCents).toBeNull();
    expect(result?.currency).toBeNull();
  });

  it("uses the configured top-N as the LIMIT by default", async () => {
    dbMock.limit.mockResolvedValueOnce([]);
    await semanticSearch("x");
    expect(dbMock.limit).toHaveBeenCalledWith(5);
  });

  it("honors an explicit limit override, clamped to [1, 50]", async () => {
    dbMock.limit.mockResolvedValue([]);

    await semanticSearch("x", 3);
    expect(dbMock.limit).toHaveBeenLastCalledWith(3);

    await semanticSearch("x", 999);
    expect(dbMock.limit).toHaveBeenLastCalledWith(50);

    await semanticSearch("x", 0);
    expect(dbMock.limit).toHaveBeenLastCalledWith(1);
  });
});
