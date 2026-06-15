# Phase 1 Data Model: Semantic Product Search

## New table: `product_embeddings`

One row **per (product, chunk)**. A short product has exactly one row; a long product
(big description + many specs) has several. This is the indexable shape (pgvector's HNSW
index works on a single `vector` column, so an array-of-vectors column is not an option).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` | Surrogate key (matches house style). |
| `product_id` | `uuid` | `NOT NULL`, FK → `products.id` **ON DELETE CASCADE** | Owning product; cascade satisfies FR-013 (delete a product → its embeddings vanish) with **no app code**. |
| `chunk_index` | `integer` | `NOT NULL` | 0-based position of the chunk within the product's composite document. Deterministic ordering for delete-and-replace + debugging. |
| `content` | `text` | `NOT NULL` | The exact text embedded for this row — the chunk **including** its identity prefix (research D4). Stored for debuggability and so the agent could cite the matched fragment. |
| `embedding` | `vector(384)` | `NOT NULL` | The MiniLM int8 embedding (cosine space). Dimension is fixed by the `local` model (FR-018); a provider switch resizes this column (deliberate migration). |
| `created_at` | `timestamp` | `defaultNow()` | When the row was indexed. |

**Drizzle schema sketch** (in `packages/db/src/schema.ts`):

```ts
export const productEmbeddings = pgTable(
  "product_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("product_embeddings_embedding_hnsw")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("product_embeddings_product_id_idx").on(t.productId),
  ],
);
```

**Indexes**:
- `product_embeddings_embedding_hnsw` — HNSW on `embedding` with `vector_cosine_ops` (the similarity index; research D6).
- `product_embeddings_product_id_idx` — btree on `product_id` to speed the delete-and-replace and the per-product dedup/cascade.

**Relation**: extend `productsRelations` with `embeddings: many(productEmbeddings)`, plus a `one(products)` back-relation. (Search returns the parent product's metadata via this relation / a join.)

## Migration

- Generated via `pnpm --filter @price-monitor/db generate` → `packages/db/drizzle/0002_*.sql`, committed.
- **Hand-prepend** `CREATE EXTENSION IF NOT EXISTS vector;` as the first statement so production (`RUN_MIGRATIONS=true`) is self-contained (locally the init script already created it — idempotent).
- Additive only: creates the new table + indexes; touches nothing existing. A rolling deploy's old code simply ignores the table (backward compatible, constitution III).
- Applied by the single gated worker on startup, or manually via `pnpm --filter @price-monitor/db migrate`.

## Conceptual entities (not tables)

- **Composite document** — the per-product text assembled in priority order
  **name → brand → category → country of origin → description → key/value specs**
  (FR-008). Built in `embeddings/document.ts`. Never persisted as-is; it is the input to chunking.
- **Chunk** — a ~200-token token-accurate slice of the composite document (small overlap), each
  prefixed with product identity (research D4/D5). Becomes one `product_embeddings` row.
- **Reindex operation** — `reindexProduct(productId)`: load product + 007 metadata → build document →
  chunk → embed each chunk → **delete all existing rows for the product, insert the new set** in one
  transaction (FR-012; atomic so a concurrent search sees old-or-new, never half — spec Edge Cases).

## State & lifecycle

| Trigger | Effect on `product_embeddings` |
|---|---|
| `update-product-info` success (on add / on demand / info+price digest batch) | Enqueue `reindex-product-embeddings` → delete-and-replace the product's rows (FR-010, FR-012). |
| `check-price` (price-only) | **No change** (FR-011). |
| Product deleted | All rows removed via FK cascade (FR-013). |
| Backfill run | Enqueues reindex per product → same delete-and-replace; idempotent re-run (FR-016, FR-017). |
| Total `update-product-info` failure (metadata untouched) | **No change** — reindex only follows a successful write (spec Edge Cases). |

## Query shape (read path)

`semanticSearch(query, limit)` in `embeddings/search.ts`:
1. `embedQuery(query)` → 384-d vector (local model).
2. `distance = cosineDistance(embedding, queryVec)`.
3. Filter `where lte(distance, SEMANTIC_SEARCH_MAX_DISTANCE)` (FR-007 threshold).
4. Best chunk per product: `selectDistinctOn([productId])` ordered by `(productId, distance asc)` (FR-005).
5. Outer order by `distance asc`, `limit(topN)` (FR-004, default 5).
6. Join `products` to return rich metadata (id, name, url, brand, category, country, description, attributes) + the matched `content` + distance, so the agent can explain the match.
7. Empty index or all-below-threshold → `[]` (FR-007; no error).

Volume: ~10–50 products × a few chunks ⇒ low hundreds of rows; HNSW search is sub-millisecond at this size, well inside SC-009.
