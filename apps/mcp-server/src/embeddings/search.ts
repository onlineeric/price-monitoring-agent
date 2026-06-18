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
 * Best-effort fallback (no dead-ends): when nothing clears the confident cutoff
 * (`maxDistance`), we don't immediately give up. A verbose, conversational query
 * ("host a dinner party … any drink …") embeds far from a terse product chunk
 * even when the product is genuinely relevant — the correct top hit can land
 * ~0.20 past where the same intent, distilled, would. So if the confident pass
 * is empty we re-query for the single nearest product within a looser bound
 * (`maxDistance + FALLBACK_MARGIN`) and return it flagged `lowConfidence: true`.
 * Only a truly off-topic query (nearest beyond the loose bound) — or a genuinely
 * empty index — yields `[]`.
 *
 * NOTE on the HNSW index: this query intentionally does NOT use the
 * `product_embeddings_embedding_hnsw` index. DISTINCT ON requires `product_id`
 * to lead the inner ORDER BY, but HNSW is only chosen when the distance
 * expression is the leading (and ideally sole) sort key — so the planner does an
 * exact sequential scan + sort here. That is the correct trade-off at this scale
 * (~10–50 products → low hundreds of chunk rows): the exact scan is well within
 * SC-009 and, unlike an HNSW over-fetch-then-dedup, it cannot silently drop a
 * product whose best chunk ranks just outside a candidate window (FR-004/FR-005
 * demand the exact top-N distinct products). If the catalog grows by orders of
 * magnitude, revisit with an HNSW-friendly candidate prefilter (and accept the
 * approximation), not before. The index is retained for that future path and for
 * the delete-and-replace write side.
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
  /** True when the row was surfaced only by the best-effort fallback (no chunk
   *  cleared the confident cutoff) — the agent should present it tentatively. */
  lowConfidence: boolean;
}

/** Cosine distance is bounded to [0, 2]; the loose fallback never exceeds it. */
const MAX_COSINE_DISTANCE = 2;
/** How far past the confident cutoff the fallback still rescues a single nearest
 *  product. Wide enough to recover verbose-but-on-topic queries (~0.20 inflated)
 *  yet tight enough that a truly off-topic query still returns nothing. */
const FALLBACK_MARGIN = 0.15;

export async function semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]> {
  const { topN, maxDistance } = getEmbeddingConfig();
  const effectiveLimit = clampLimit(limit, topN);

  const queryVec = await embedQuery(query);
  const distance = cosineDistance(productEmbeddings.embedding, queryVec);

  // Best (nearest) chunk per product within `cutoff`, ordered nearest-first,
  // capped at `take`. DISTINCT ON requires product_id to lead the inner
  // order-by, which is why the dedup is a wrapping subquery (see file header).
  const nearestPerProduct = (cutoff: number, take: number) => {
    const best = db
      .selectDistinctOn([productEmbeddings.productId], {
        productId: productEmbeddings.productId,
        content: productEmbeddings.content,
        distance: sql<number>`${distance}`.as("distance"),
      })
      .from(productEmbeddings)
      .where(lte(distance, cutoff))
      .orderBy(productEmbeddings.productId, asc(distance))
      .as("best");

    return db
      .select({ productId: best.productId, content: best.content, distance: best.distance })
      .from(best)
      .orderBy(asc(best.distance))
      .limit(take);
  };

  // Confident pass: every product within the relevance cutoff, top-N.
  let matches = await nearestPerProduct(maxDistance, effectiveLimit);
  let lowConfidence = false;

  // Best-effort fallback: nothing was confident, so surface the single nearest
  // product within a looser bound rather than dead-ending the user (see header).
  if (matches.length === 0) {
    const looseCutoff = Math.min(MAX_COSINE_DISTANCE, maxDistance + FALLBACK_MARGIN);
    matches = await nearestPerProduct(looseCutoff, 1);
    lowConfidence = matches.length > 0;
  }

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
      lowConfidence,
    });
  }
  return results;
}

/** Clamp the optional caller limit into [1, 50]; fall back to the configured top-N. */
function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(limit)));
}
