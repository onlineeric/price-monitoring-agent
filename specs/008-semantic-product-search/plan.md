# Implementation Plan: Semantic Product Search (pgvector RAG embedding pipeline)

**Branch**: `008-semantic-product-search` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-semantic-product-search/spec.md`

## Summary

Add meaning-based product search to the chat agent. Each product's feature-007 rich
metadata (name, brand, category, country, description, key/value specs) is assembled
into a composite document, split into ~200-token token-accurate chunks, and embedded
with a **local** `all-MiniLM-L6-v2` model (384-dim) into a new `product_embeddings`
table — **one row per (product, chunk)** with an HNSW cosine index. A new
`semantic_search_products` MCP tool embeds the user's query, runs a cosine-distance
search across chunk rows, applies a configurable relevance cutoff, collapses to the
best chunk per product, and returns the top-N (default 5) distinct products with their
metadata. The index is kept current by a **dedicated, retryable `reindex-product-
embeddings` BullMQ job** the worker enqueues after every successful `update-product-
info`, and a one-off backfill enqueues the same job for every existing product.

The **`mcp-server` is the single embedding authority** (it loads the model once for
both query-time and write-time), satisfying the production RAM budget. The worker and
backfill never load the model — they enqueue a reindex job whose handler makes one
internal HTTP call to the mcp-server's new `POST /internal/reindex` endpoint; BullMQ
provides the durable retry/backoff.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 20, ESM (`"type": "module"`) across `apps/mcp-server`, `apps/worker`, `packages/db`.

**Primary Dependencies**:
- `@huggingface/transformers` (Transformers.js) running `Xenova/all-MiniLM-L6-v2`, 384-dim, quantized int8, called **directly** (not via the AI SDK) — added to `apps/mcp-server`.
- `@langchain/textsplitters` `RecursiveCharacterTextSplitter` configured with a **token-accurate** length function backed by the MiniLM tokenizer (~200-token chunks, small overlap) — added to `apps/mcp-server`.
- `drizzle-orm` 0.45.1 — confirmed native `vector` column (`pg-core/columns/vector_extension`), `cosineDistance()` helper, and HNSW index support, so the query stays query-builder-native (no `db.execute()`).
- `pgvector` (already provisioned: `pgvector/pgvector:pg18` image + `scripts/db-init/01-enable-pgvector.sql` from task 4.1).
- `bullmq` 5 (existing) for the new `reindex-product-embeddings` job; `@modelcontextprotocol/sdk` 1.29 (existing) for the new tool.
- **Optional** non-local providers (`EMBEDDING_PROVIDER=openai|google`) via Vercel AI SDK `embedMany` — `ai` + `@ai-sdk/openai` + `@ai-sdk/google` would be added to `apps/mcp-server` only if those providers are wired; the **default `local` path needs none of them**.

**Storage**: PostgreSQL 18 + pgvector. New `product_embeddings` table: `id`, `product_id` (uuid FK → `products.id`, `ON DELETE CASCADE`), `chunk_index` (int), `content` (text), `embedding vector(384)`. HNSW index on `embedding` with `vector_cosine_ops`. Additive, versioned migration; extension creation included in the migration for prod self-containment.

**Testing**: Vitest in `mcp-server`, `worker`, `db`. Model, DB, and queue are mocked at the module boundary (chainable-Drizzle mock pattern already established in `apps/mcp-server/src/tools/*.test.ts` and `apps/worker/src/jobs/*.test.ts`). No live model download in unit tests.

**Target Platform**: Linux server, Docker (local compose) / Coolify on a 2 vCPU · 4 GB DigitalOcean droplet (three internal apps: web, worker, mcp-server).

**Project Type**: Monorepo web service — Next.js `web` + BullMQ `worker` + `mcp-server` + shared `packages/db`.

**Performance Goals**: Interactive chat search returns within ~2 s on the production-sized catalog (SC-009). Query-time embedding is local and sub-second after warm-up. Reindex is asynchronous/occasional (off the request path).

**Constraints**: Production RAM budget — the model is loaded in **exactly one process** (`mcp-server`), ~300 MB resident paid once, keeping the droplet within its established headroom (SC-008). MiniLM's ~256-token window forces our own chunking (~200 tokens, token-accurate). Reindex MUST never block or fail the metadata/price write (constitution V; FR-015).

**Scale/Scope**: Small catalog (~10–50 products) → a few chunks per product → low hundreds of embedding rows. top-N default 5. Re-embed on every info refresh (no content-hash skip at this size).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Monorepo Architecture Fidelity** | ✅ Extends existing boundaries only: new table + migration in `packages/db`; embedding model/chunking/search/reindex in `apps/mcp-server` (justified single model owner per the locked RAM decision); new job type + producer in `apps/worker`; backfill script mirrors the 007 backfill in `apps/worker/scripts/`. No new app or package. |
| **II. Typed, Explicit, Maintainable Code** | ✅ TS-first; Zod-validated tool input; purpose-built libraries (Transformers.js, LangChain splitter, Drizzle `vector`/`cosineDistance`) instead of bespoke math or regex; small single-responsibility modules (`document`, `chunk`, `provider`, `reindex`, `search`). |
| **III. Safe Data Access & Canonical Models** | ✅ Drizzle query builder throughout, including `vector(384)` column and `cosineDistance()` for the similarity query — **no `db.execute()`**. Prices untouched; URL identity unchanged. Migration is **additive** and backward compatible (old code ignores the new table). DDL-only items (`CREATE EXTENSION`, HNSW index) live in the generated migration SQL. |
| **IV. Independent, Risk-Proportional Verification** | ✅ Three independently testable stories; per-story verification stated below. Automated coverage for composite-doc order, token-accurate chunking, delete-and-replace reindex, the trigger boundary (reindex on info refresh, **not** on price check), threshold cutoff + best-chunk dedup + top-N, empty-index behavior, deletion cascade, and backfill idempotency. Backends mocked at the module boundary. |
| **V. Operational Resilience by Default** | ✅ New env vars documented (below); additive migration auto-applied by the gated instance (`RUN_MIGRATIONS`); reindex is a retryable queued job (self-heals, never fails the write); structured logging for reindex + search; model baked into the mcp-server image for deterministic prod cold-start; graceful empty-result behavior. |

**Result**: PASS — no violations. Complexity Tracking left empty.

### Constitution-relevant env/config changes (documented per Principle V)

| Variable | Where | Purpose | Default |
|---|---|---|---|
| `EMBEDDING_PROVIDER` | mcp-server | `local` \| `openai` \| `google` (mirrors `AI_PROVIDER`) | `local` |
| `EMBEDDING_MODEL` | mcp-server | local model id override | `Xenova/all-MiniLM-L6-v2` |
| `EMBEDDING_CACHE_DIR` | mcp-server | Transformers.js model cache dir (baked in image) | image path |
| `SEMANTIC_SEARCH_TOP_N` | mcp-server | default distinct-product result cap (FR-004) | `5` |
| `SEMANTIC_SEARCH_MAX_DISTANCE` | mcp-server | cosine-distance relevance cutoff (FR-007) | tuned in 4.8 (e.g. `0.55`) |
| `MCP_REINDEX_URL` | worker | full URL of mcp-server's internal reindex endpoint | `http://…:3002/internal/reindex` |

## Project Structure

### Documentation (this feature)

```text
specs/008-semantic-product-search/
├── plan.md              # This file
├── research.md          # Phase 0 — resolves the 3 deferred design questions + tech decisions
├── data-model.md        # Phase 1 — product_embeddings table + entities
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — tool / endpoint / job interface contracts
│   ├── semantic_search_products.md
│   ├── internal-reindex-endpoint.md
│   └── reindex-job.md
├── checklists/
│   └── requirements.md   # (from /speckit-specify + /speckit-clarify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema.ts                         # + productEmbeddings table + relation; vector(384), HNSW index
└── drizzle/0002_*.sql                     # generated migration; hand-prepend CREATE EXTENSION IF NOT EXISTS vector

apps/mcp-server/
├── src/embeddings/
│   ├── provider.ts                        # EMBEDDING_PROVIDER seam: embedTexts() / embedQuery() / dimensions
│   ├── local.ts                           # Transformers.js MiniLM lazy singleton (the default provider)
│   ├── document.ts                        # composite document (name→brand→category→country→description→specs)
│   ├── chunk.ts                           # token-accurate RecursiveCharacterTextSplitter (~200 tok, overlap, identity prefix)
│   ├── reindex.ts                         # reindexProduct(productId): build → chunk → embed → delete-and-replace rows
│   └── search.ts                          # semanticSearch(query, limit): embedQuery → cosine search → threshold → dedup → top-N
├── src/tools/semantic-search-products.ts  # new MCP tool wrapping search.ts (registered in server.ts)
├── src/transports/http.ts                 # + POST /internal/reindex route (http mode only; NOT an MCP tool)
└── src/config.ts                          # + embedding/search config

apps/worker/
├── src/jobs/reindexEmbeddings.ts          # new handler: POST MCP_REINDEX_URL { productId } (BullMQ retry/backoff)
├── src/jobs/updateProductInfo.ts          # success path: best-effort enqueue reindex job (never fails the write)
├── src/queue/worker.ts                    # + "reindex-product-embeddings" case in processJob switch
├── src/queue/producer.ts                  # small Queue producer helper (enqueueReindex)
├── src/config.ts                          # + MCP_REINDEX_URL
└── scripts/backfill-embeddings.ts         # enqueue reindex job for every product (mirrors backfill-product-info.ts)

docker-compose.yml                         # worker service: + MCP_REINDEX_URL; mcp-server: + embedding env
docs/production-env.md                     # mcp-server embedding env + worker MCP_REINDEX_URL
CLAUDE.md                                  # Architecture: semantic search + reindex flow (recent-changes note)
```

**Structure Decision**: No new app/package. The model lives only in `apps/mcp-server` (the locked single-authority decision); `packages/db` owns the shared schema; `apps/worker` owns the trigger + retry + backfill. This keeps the RAM budget intact and reuses the established queue, migration, and backfill patterns.

### Per-story verification (Principle IV)

- **US1 (search)** — unit-test `search.ts` over a mocked embedding + chainable-Drizzle mock: threshold drops below-cutoff matches (empty for off-topic), dedup returns one row per product, top-N respected; tool test asserts the returned shape + registration. Manual: 4.8 chatbot query.
- **US2 (freshness)** — unit-test `reindex.ts` delete-and-replace (mock DB); test the `updateProductInfo` success path enqueues exactly one reindex job and the price-only path enqueues none; test `reindexEmbeddings` handler retries on HTTP failure; deletion cascade covered by the FK (schema-level test/assertion).
- **US3 (backfill)** — unit-test the backfill enqueues one job per product and is safe to re-run (idempotent via delete-and-replace in the handler).

## Complexity Tracking

> No constitution violations — no entries required.
