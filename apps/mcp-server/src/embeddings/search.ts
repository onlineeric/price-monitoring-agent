import { db, priceRecords, productEmbeddings, products } from "@price-monitor/db";
import type { ProductAttribute } from "@price-monitor/db";
import { asc, cosineDistance, desc, inArray, lte, sql } from "drizzle-orm";
import { getEmbeddingConfig } from "../config.js";
import { embedQuery } from "./provider.js";

/**
 * Semantic search read path (feature 008, US1).
 *
 * Drizzle query builder only — no `db.execute()`. `cosineDistance` is an inline
 * `sql` expression, which the constitution permits (III). The shape:
 *
 *   1. Embed the query (local model).
 *   2. Inner DISTINCT ON (product_id): the nearest chunk per product, after
 *      dropping rows beyond the relevance cutoff (FR-007). DISTINCT ON requires
 *      product_id to lead the order-by, which is exactly why this is a wrapping
 *      subquery rather than one flat query.
 *   3. Outer: order the per-product best chunks by distance, take top-N (FR-004).
 *   4. Fetch the parent products' rich metadata + latest price in one round-trip,
 *      reusing the `search_products` latest-price pattern, then re-attach the
 *      distance/matched-chunk and preserve the nearest-first order.
 *
 * Empty index or all-below-threshold → `[]` (no error).
 */

export interface SemanticSearchResult {
  id: string;
  name: string | null;
  url: string;
  brand: string | null;
  category: string | null;
  countryOfOrigin: string | null;
  description: string | null;
  attributes: ProductAttribute[] | null;
  currentPriceCents: number | null;
  currency: string | null;
  matchedChunk: string;
  distance: number;
}

export async function semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]> {
  const { topN, maxDistance } = getEmbeddingConfig();
  const effectiveLimit = clampLimit(limit, topN);

  const queryVec = await embedQuery(query);
  const distance = cosineDistance(productEmbeddings.embedding, queryVec);

  // Inner: best (nearest) chunk per product within the relevance cutoff.
  const best = db
    .selectDistinctOn([productEmbeddings.productId], {
      productId: productEmbeddings.productId,
      content: productEmbeddings.content,
      distance: sql<number>`${distance}`.as("distance"),
    })
    .from(productEmbeddings)
    .where(lte(distance, maxDistance))
    .orderBy(productEmbeddings.productId, asc(distance))
    .as("best");

  // Outer: order those per-product winners by distance, take top-N.
  const matches = await db
    .select({
      productId: best.productId,
      content: best.content,
      distance: best.distance,
    })
    .from(best)
    .orderBy(asc(best.distance))
    .limit(effectiveLimit);

  if (matches.length === 0) return [];

  // Fetch rich metadata + latest price for the matched products in one query.
  const ids = matches.map((m) => m.productId);
  const productRows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: {
      id: true,
      name: true,
      url: true,
      brand: true,
      category: true,
      countryOfOrigin: true,
      description: true,
      attributes: true,
    },
    with: {
      priceRecords: {
        limit: 1,
        orderBy: [desc(priceRecords.scrapedAt)],
        columns: { price: true, currency: true },
      },
    },
  });
  const byId = new Map(productRows.map((p) => [p.id, p]));

  // Re-attach distance/matched-chunk, preserving the nearest-first order.
  const results: SemanticSearchResult[] = [];
  for (const match of matches) {
    const product = byId.get(match.productId);
    if (!product) continue; // defensive: product vanished between queries
    const latest = product.priceRecords[0];
    results.push({
      id: product.id,
      name: product.name,
      url: product.url,
      brand: product.brand,
      category: product.category,
      countryOfOrigin: product.countryOfOrigin,
      description: product.description,
      attributes: product.attributes,
      currentPriceCents: latest?.price ?? null,
      currency: latest?.currency ?? null,
      matchedChunk: match.content,
      distance: Number(match.distance),
    });
  }
  return results;
}

/** Clamp the optional caller limit into [1, 50]; fall back to the configured top-N. */
function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(limit)));
}
