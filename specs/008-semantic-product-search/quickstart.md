# Quickstart & Validation Guide: Semantic Product Search

A runnable guide proving the Phase 4 embedding pipeline end-to-end. Implementation
detail lives in [plan.md](./plan.md), [data-model.md](./data-model.md), and
[contracts/](./contracts/); this file is the **validate-it-works** path.

## Prerequisites

- pgvector is enabled (task 4.1 — `pgvector/pgvector:pg18` + `scripts/db-init/01-enable-pgvector.sql`).
- 007 metadata exists: run `pnpm --filter @price-monitor/worker backfill:product-info` first so products have description/specs to embed (run-order dependency, FR-016 / US3 #3).
- Dependencies installed in `apps/mcp-server`: `@huggingface/transformers`, `@langchain/textsplitters` (and `ai`+adapters only if using non-local providers).

## One-time setup

```bash
pnpm docker:up                                   # Postgres (pgvector) + Redis
pnpm --filter @price-monitor/db generate         # generate 0002 migration from schema.ts
#   → hand-prepend `CREATE EXTENSION IF NOT EXISTS vector;` to packages/db/drizzle/0002_*.sql, commit
pnpm --filter @price-monitor/db migrate          # create product_embeddings + HNSW index
```

Env (root `.env` for dev): `EMBEDDING_PROVIDER=local`, `SEMANTIC_SEARCH_TOP_N=5`,
`SEMANTIC_SEARCH_MAX_DISTANCE=0.55`, worker `MCP_REINDEX_URL=http://localhost:3002/internal/reindex`.

## Run the services

```bash
pnpm mcp:up                                       # mcp-server (owns the model) on :3002
pnpm worker:dev                                   # worker (enqueues + consumes reindex jobs)
pnpm --filter @price-monitor/web dev              # web/chat UI
```

## Validation scenarios

### 1. Schema & extension (US-foundation)
```bash
# product_embeddings exists with a vector(384) column + HNSW index
psql "$DATABASE_URL" -c "\d+ product_embeddings"
```
**Expect**: table present, `embedding` is `vector(384)`, an `hnsw` index on `embedding`.

### 2. Internal reindex endpoint (US2)
```bash
curl -s -XPOST localhost:3002/internal/reindex -H 'content-type: application/json' \
  -d '{"productId":"<an existing product id>"}'
```
**Expect**: `200 {"productId":"…","chunks":N}` with `N ≥ 1`; rows appear in `product_embeddings` for that product. Re-run → same `N`, no duplicates (delete-and-replace, FR-012/FR-017).

### 3. Backfill the catalog (US3)
```bash
pnpm --filter @price-monitor/worker backfill:embeddings
```
**Expect**: one `reindex-product-embeddings` job per product; worker logs `reindex productId=… chunks=…`; every product with metadata gets rows. Re-run is a clean no-op-equivalent (idempotent, FR-017).

### 4. Freshness trigger boundary (US2 — FR-010/FR-011)
- Trigger **update product info** on a product (UI action or API) → a reindex job runs and its rows are replaced.
- Trigger **check price now** on a product → **no** reindex job, embeddings unchanged.
**Expect**: row `created_at` advances only after the info refresh, never after a price check.

### 5. Semantic search in chat (US1 — the headline)
Open `/dashboard/chat` and ask a query whose words are **not** in any product name:
> "find me a gaming monitor good for video editing"

**Expect**: the agent calls `semantic_search_products`, returns the relevant monitor(s) with metadata; the tool-call trace shows the semantic tool. A deliberately off-topic query ("recommend a hiking trail") returns **no products** (threshold cutoff, FR-007), and the agent says nothing relevant was found. A "cheap …" query routes the price part to the price tools (FR-006).

### 6. Deletion cascade (US2 — FR-013)
Delete a product (UI/API) → its `product_embeddings` rows are gone (FK cascade) and it no longer appears in search.

### 7. Resilience (US2 — FR-015 / SC-010)
Stop the mcp-server, trigger an update-product-info → the metadata/price write **still succeeds**; the reindex job retries with backoff. Restart mcp-server → a retry succeeds and the index catches up, no manual step.

## Automated tests
```bash
pnpm --filter @price-monitor/db test
pnpm --filter @price-monitor/mcp-server test      # document/chunk/search/reindex + tool
pnpm --filter @price-monitor/worker test          # enqueue-on-info, no-enqueue-on-price, handler retry, backfill
pnpm lint
```

## Tuning note (task 4.8)
Calibrate `SEMANTIC_SEARCH_MAX_DISTANCE` against real queries: too low → relevant products dropped; too high → off-topic products leak in. Start ~0.55 and adjust.
