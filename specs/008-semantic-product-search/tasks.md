---
description: "Task list for Semantic Product Search (pgvector RAG embedding pipeline)"
---

# Tasks: Semantic Product Search (pgvector RAG embedding pipeline)

**Input**: Design documents from `/specs/008-semantic-product-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present), quickstart.md

**Roadmap mapping**: This is Phase 4 of `docs/AI-agent-mcp-server-idea.md`. 4.1 (`pgvector` enabled) is done. This `tasks.md` is the implement phase of 4.2; it covers roadmap items **4.3 (schema/migration), 4.4 (embedding service), 4.5 (backfill), 4.6 (auto-embed hook), 4.7 (`semantic_search_products` tool)**. 4.8 is the manual end-to-end test (folded into Polish validation).

**Tests**: Included — the spec's *Verification Notes* and the plan's *Per-story verification* explicitly require automated coverage, and CLAUDE.md mandates a colocated test in the same change. Backends (model, DB, queue) are mocked at the module boundary per the repo convention.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (P1 search), US2 (P2 freshness), US3 (P3 backfill); no label for Setup / Foundational / Polish
- Every task names an exact file path

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and env scaffolding shared by all stories

- [X] T001 [P] Install embedding dependencies in `apps/mcp-server` — `pnpm --filter @price-monitor/mcp-server add @huggingface/transformers @langchain/textsplitters`; confirm they land in `apps/mcp-server/package.json` (dev still downloads the MiniLM int8 weights to a local cache on first use; prod bakes them in — T034).
- [X] T002 [P] Add the new env defaults to the root `.env.example`: `EMBEDDING_PROVIDER=local`, `EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2`, `EMBEDDING_CACHE_DIR=.cache/transformers` (dev cache path; the prod image bakes weights into its own baked-in path — T034/T036), `SEMANTIC_SEARCH_TOP_N=5`, `SEMANTIC_SEARCH_MAX_DISTANCE=0.55`, and the worker's `MCP_REINDEX_URL=http://localhost:3002/internal/reindex` (dev value; worker-in-Docker override comes in T035).
- [X] T003 Verify the pgvector prerequisite from task 4.1 is intact: `docker-compose.yml` uses `pgvector/pgvector:pg18` and `scripts/db-init/01-enable-pgvector.sql` exists (no change expected — fail loudly if missing before building on it).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `product_embeddings` table, config seams, and the shared embedding model authority that **both** the search (US1) and reindex (US2) paths build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add the `productEmbeddings` table to `packages/db/src/schema.ts` per `data-model.md`: `id` uuid PK `defaultRandom()`, `product_id` uuid `NOT NULL` FK → `products.id` `ON DELETE CASCADE`, `chunk_index` int, `content` text, `embedding vector("embedding", { dimensions: 384 })`, `created_at` `defaultNow()`; HNSW index `product_embeddings_embedding_hnsw` `.using("hnsw", t.embedding.op("vector_cosine_ops"))` + btree `product_embeddings_product_id_idx`; extend `productsRelations` with `embeddings: many(...)` and a `one(products)` back-relation.
- [X] T005 Generate the migration: `pnpm --filter @price-monitor/db generate` → `packages/db/drizzle/0002_*.sql`; **hand-prepend** `CREATE EXTENSION IF NOT EXISTS vector;` as the first statement (self-contained prod apply); verify it creates only the new table + indexes (additive); commit the SQL and the `drizzle/meta` snapshot.
- [X] T006 [P] Extend `packages/db/src/schema.test.ts` to assert the `product_embeddings` columns, the `vector(384)` type, the FK cascade, and both index definitions.
- [X] T007 [P] Add embedding + search config to `apps/mcp-server/src/config.ts`: `EMBEDDING_PROVIDER` (default `local`), `EMBEDDING_MODEL` (default `Xenova/all-MiniLM-L6-v2`), `EMBEDDING_CACHE_DIR`, `SEMANTIC_SEARCH_TOP_N` (default `5`), `SEMANTIC_SEARCH_MAX_DISTANCE` (default `0.55`).
- [X] T008 [P] Add `MCP_REINDEX_URL` (default `http://localhost:3002/internal/reindex`) to `apps/worker/src/config.ts`.
- [X] T009 Implement the local model singleton in `apps/mcp-server/src/embeddings/local.ts`: lazy-build the Transformers.js feature-extraction pipeline for `EMBEDDING_MODEL` (int8, mean-pooled + normalized 384-dim), set `env.cacheDir = EMBEDDING_CACHE_DIR` and `env.allowRemoteModels = false` when `NODE_ENV === "production"`; module import stays side-effect-free.
- [X] T010 Implement the provider seam in `apps/mcp-server/src/embeddings/provider.ts`: export `embedTexts(string[]) => number[][]`, `embedQuery(string) => number[]`, and `dimensions`; dispatch on `EMBEDDING_PROVIDER` (`local` → `local.ts`, the only default-built path; `openai` 1536-dim / `google` 768-dim left as guarded `embedMany` branches that throw a clear "install `ai`+adapter and migrate the vector column" error until wired). Depends on T009.
- [X] T011 [P] Add `apps/mcp-server/src/embeddings/provider.test.ts`: mock the pipeline so `embedQuery`/`embedTexts` return fixed-length 384 vectors without downloading a model; assert non-local providers throw the documented switch-required error.

**Checkpoint**: Table exists, model authority and config seams are in place — stories can proceed.

---

## Phase 3: User Story 1 - Find products by meaning in chat (Priority: P1) 🎯 MVP

**Goal**: A `semantic_search_products` MCP tool that embeds the user's query, runs a cosine-distance search over chunk rows, applies the relevance cutoff, dedups to the best chunk per product, and returns the top-N distinct products with rich metadata.

**Independent Test**: With a handful of products indexed (rows in `product_embeddings`), a descriptive query whose words are absent from any product name returns the semantically relevant product(s), each distinct with metadata; an off-topic query returns `[]` with no error. At unit level, `search.ts` is testable over a mocked embedding + chainable-Drizzle mock with no live model/DB.

- [X] T012 [US1] Implement `semanticSearch(query, limit)` in `apps/mcp-server/src/embeddings/search.ts` (Drizzle query-builder only, **no `db.execute()`** — `cosineDistance` is an inline `sql` expression, permitted by constitution III): `embedQuery(query)` → `distance = cosineDistance(productEmbeddings.embedding, queryVec)` → `where lte(distance, SEMANTIC_SEARCH_MAX_DISTANCE)` (FR-007) → **inner** `selectDistinctOn([productId], …)` ordered by `(productId, distance asc)` for the best chunk per product, wrapped via `.as("best")` (FR-005) → **outer** select from `best` ordered by `distance asc`, `limit(topN)` (FR-004), joining `products` for rich metadata **and the latest `priceRecords` row for the current price** (reuse the `search_products` latest-price pattern so the tool can format `currentPriceFormatted`); empty index / all-below-threshold → `[]`. If the distinct-on + outer-order/limit composition cannot be expressed in the builder, fall back to a `ROW_NUMBER()` window via an inline `sql` expression and record the constitution-III note in plan Complexity Tracking.
- [X] T013 [P] [US1] Add `apps/mcp-server/src/embeddings/search.test.ts`: threshold drops below-cutoff rows (off-topic → `[]`); dedup yields one row per product; top-N respected; empty index returns `[]` not an error.
- [X] T014 [US1] Implement the `semantic_search_products` tool in `apps/mcp-server/src/tools/semantic-search-products.ts` per `contracts/semantic_search_products.md`: Zod input `{ query: non-empty string, limit?: 1..50 }`; tool description states it is the **semantic** part only (price predicates go to the price tools — FR-006); call `semanticSearch`; map rows to the documented output (id, name, url, brand, category, countryOfOrigin, description, attributes, `currentPriceFormatted` via the existing `_format` helper, `matchedChunk`, `distance`); empty result returns `[]` + a short human note; wrap with `_wrap.ts`; emit one access-log line per call (tool name, status, ms — confirm the shared `_wrap`/access-log path covers it, matching the existing MCP access-log policy) and do not log full query args.
- [X] T015 [P] [US1] Add `apps/mcp-server/src/tools/semantic-search-products.test.ts`: success shape, empty-result note, and error-envelope path (mock `semanticSearch`).
- [X] T016 [US1] Register `semantic_search_products` in `apps/mcp-server/src/server.ts` alongside (not replacing) `search_products`; verify it appears over both transports.

**Checkpoint**: The chat agent can call semantic search; given indexed rows it returns distinct, relevant products. MVP demonstrable.

---

## Phase 4: User Story 2 - Vectors stay current with product metadata (Priority: P2)

**Goal**: A successful `update-product-info` enqueues a retryable `reindex-product-embeddings` job that delete-and-replaces the product's chunk rows via the mcp-server's internal endpoint; a price-only check never reindexes; deletion cascades; transient embedding-side failures self-heal without failing the write.

**Independent Test**: Run "update product info" → a reindex job rebuilds rows; run "check price now" → no reindex job, rows unchanged; delete a product → its rows vanish; stop the mcp-server during an info refresh → the metadata/price write still succeeds and the job retries until it catches up.

- [X] T017 [P] [US2] Implement the composite document in `apps/mcp-server/src/embeddings/document.ts`: assemble per-product text in priority order **name → brand → category → country of origin → description → key/value specs** (FR-008), omitting absent fields; a name-only product still yields a minimal self-describing document (never skipped).
- [X] T018 [P] [US2] Add `apps/mcp-server/src/embeddings/document.test.ts`: field order, absent-field omission, name-only minimal document.
- [X] T019 [US2] Implement token-accurate chunking in `apps/mcp-server/src/embeddings/chunk.ts`: `@langchain/textsplitters` `RecursiveCharacterTextSplitter` with a **token length function** backed by the MiniLM tokenizer (`chunkSize ≈ 200`, `chunkOverlap ≈ 20–40`), prepend the `"{name} — {brand} ({category})"` identity prefix to each chunk (research D4), with `chunkSize` budgeting for the prefix so every embedded string stays within MiniLM's ~256-token window.
- [X] T020 [P] [US2] Add `apps/mcp-server/src/embeddings/chunk.test.ts`: bounded fragment token counts, overlap present, single-chunk degradation for short input, identity prefix on every chunk, no content silently dropped.
- [X] T021 [US2] Implement `reindexProduct(productId)` in `apps/mcp-server/src/embeddings/reindex.ts`: load product + 007 metadata via Drizzle → `buildDocument` → `chunk` → `embedTexts` → **delete all existing `product_embeddings` rows for the product and insert the new set in one transaction** (FR-012, atomic); return the chunk count. Depends on T010, T017, T019.
- [X] T022 [P] [US2] Add `apps/mcp-server/src/embeddings/reindex.test.ts` (mock DB + provider): delete-then-insert ordering, `≥1` row for a name-only product, single-transaction atomicity.
- [X] T023 [US2] Add the `POST /internal/reindex` route to `apps/mcp-server/src/transports/http.ts` per `contracts/internal-reindex-endpoint.md` (http mode only, **not** an MCP tool): Zod-validate `{ productId }` (malformed → `400 validation_error`), call `reindexProduct`, return `200 { productId, chunks }`; unknown product → `404 not_found`; embed/DB failure → `500 { error: { code, message } }`. Depends on T021.
- [X] T024 [P] [US2] Add a test for the reindex route (e.g. `apps/mcp-server/src/transports/http.test.ts`): `400` on bad body, `404` on unknown product, `200 { productId, chunks }` on success (mock `reindexProduct`).
- [X] T025 [US2] Implement the worker reindex producer in `apps/worker/src/queue/producer.ts`: `enqueueReindex(productId)` adds a `reindex-product-embeddings` job with `{ attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 100 }` per `contracts/reindex-job.md` (reuse the existing queue connection).
- [X] T026 [US2] Implement the job handler in `apps/worker/src/jobs/reindexEmbeddings.ts`: `fetch(MCP_REINDEX_URL, { method: "POST", body: { productId } })`; non-2xx or network error → **throw** (BullMQ backoff retry); `2xx` → log `reindex productId=<id> chunks=<n>`. Holds no model, does no embedding. Depends on T008.
- [X] T027 [P] [US2] Add `apps/worker/src/jobs/reindexEmbeddings.test.ts` (mock `fetch`): throws on non-2xx and network error (so it retries); success logs the chunk count.
- [X] T028 [US2] Add the `"reindex-product-embeddings"` case to the `processJob` switch in `apps/worker/src/queue/worker.ts`, dispatching to `reindexEmbeddings`. Depends on T026.
- [X] T029 [US2] In the success branch of `apps/worker/src/jobs/updateProductInfo.ts` — after `saveProductInfo` + `updateProductTimestamp` + `logRun` — best-effort `enqueueReindex(productId)` wrapped in try/catch so an enqueue failure is logged but **never** fails the metadata/price write (FR-015); the info+price digest batch is covered automatically since it fans out to per-product `update-product-info` (FR-010). Depends on T025.
- [X] T030 [P] [US2] Update `apps/worker/src/jobs/updateProductInfo.test.ts`: a successful info refresh enqueues exactly one reindex job; a total-failure path enqueues none; an `enqueueReindex` throw does not fail the job. (Price-only no-reindex is asserted in `priceCheck.test.ts` — confirm `check-price` never enqueues, FR-011. The **price-mode digest** also never enqueues because the reindex producer lives only in the `update-product-info` success path, not in the price-only refresh — assert or note this so the full FR-011 clause is covered.)

**Checkpoint**: The index self-maintains on info refresh, ignores price checks, cascades on delete, and survives a transient mcp-server outage.

---

## Phase 5: User Story 3 - Backfill the existing catalog (Priority: P3)

**Goal**: A one-off, idempotent backfill that enqueues a reindex job for every existing product, so the whole catalog becomes searchable immediately.

**Independent Test**: Run the backfill once → every product with metadata becomes findable; run it again → completes with no errors and no duplicate rows (delete-and-replace per product).

- [X] T031 [US3] Implement `apps/worker/scripts/backfill-embeddings.ts` mirroring `backfill-product-info.ts`: select all product ids and `enqueueReindex` one job per product; log progress; document the run-order dependency (run `backfill:product-info` first so metadata exists — FR-016). Depends on T025.
- [X] T032 [P] [US3] Add `apps/worker/scripts/backfill-embeddings.test.ts`: enqueues exactly one job per product; a second run produces the same set (idempotency rides on the handler/endpoint delete-and-replace — FR-017).
- [X] T033 [US3] Add the `backfill:embeddings` script to `apps/worker/package.json` (mirror the existing `backfill:product-info` entry) and reference it in CLAUDE.md's command list (the doc edit is folded into T037).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Production provisioning, env wiring, docs, and full validation

- [X] T034 [P] Bake the MiniLM int8 weights into `apps/mcp-server/Dockerfile` (research D3): a build step warms a baked-in cache dir; set `ENV EMBEDDING_CACHE_DIR=/app/.cache/transformers` (the explicit prod image path, distinct from the dev `.cache/transformers`) and an offline flag (`allowRemoteModels=false` / `TRANSFORMERS_OFFLINE`) for runtime so a running container never reaches the HF Hub; keep lazy in-process init.
- [X] T035 [P] Wire env into `docker-compose.yml`: mcp-server service gets `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_CACHE_DIR` / `SEMANTIC_SEARCH_TOP_N` / `SEMANTIC_SEARCH_MAX_DISTANCE`; the worker service gets `MCP_REINDEX_URL=http://mcp-server:3002/internal/reindex` (Docker service name, not `localhost`).
- [X] T036 [P] Update `docs/production-env.md`: mcp-server embedding env vars, worker `MCP_REINDEX_URL` (prod `http://price-monitor-mcp-prod:3002/internal/reindex`), pgvector enablement note, and the deliberate provider-switch runbook (resize `vector(N)` migration → re-run backfill → rebuild HNSW — FR-019).
- [X] T037 [P] Update `CLAUDE.md` Architecture + Recent Changes: the semantic-search tool, the reindex job flow (worker → `POST /internal/reindex`), the single-model-authority note, and the new `backfill:embeddings` command.
- [X] T038 Run `pnpm lint` and `pnpm test` across all workspaces (db, mcp-server, worker) and fix any failures.
- [X] T039 Run the `quickstart.md` validation scenarios end-to-end (schema/extension, internal reindex endpoint, catalog backfill, freshness trigger boundary, chat semantic search, deletion cascade, resilience) and **tune `SEMANTIC_SEARCH_MAX_DISTANCE`** against real catalog queries (roadmap 4.8 — start `0.55`). This calibration **gates US1 "done"** — retrieval quality is unvalidated until tuned (finding A1). Also hand-verify SC-009 (~2 s interactive latency) here; there is no automated perf test at this catalog size (finding G2).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all stories**.
- **US1 (Phase 3)**: depends on Foundational (needs the table + `provider.embedQuery`). The MVP.
- **US2 (Phase 4)**: depends on Foundational (needs the table + `provider.embedTexts`); independent of US1.
- **US3 (Phase 5)**: depends on Foundational + the US2 producer (`enqueueReindex`, T025) and the US2 internal endpoint (T023) to do real work; independent of US1.
- **Polish (Phase 6)**: depends on the stories it touches; T039 needs all three.

### Key cross-task dependencies

- T010 → T009 (provider seam over the local model).
- T012/T014 (US1) → T010.
- T021 (reindex) → T010, T017, T019.
- T023 (endpoint) → T021; T026 (handler) → T008; T028 → T026; T029 → T025.
- T031 (backfill) → T025; its real-work idempotency → T023.

### Story independence

- US1 is fully unit-testable (mocked embedding + Drizzle) without US2/US3. For a **live** demo it needs rows, which US2 or US3 supplies — the unit tests do not.
- US2 and US3 do not depend on US1.

---

## Parallel Opportunities

```bash
# Phase 1 setup — all parallel:
T001  install mcp-server embedding deps
T002  .env.example additions
T003  verify pgvector prerequisite

# Phase 2 foundational — after T004/T005 land the table, these are parallel:
T006  schema test          (packages/db)
T007  mcp-server config     (apps/mcp-server)
T008  worker config         (apps/worker)
T011  provider test         (apps/mcp-server)   # after T009+T010

# US2 building blocks — parallel (different files):
T017  document.ts   |  T018 document.test.ts
T019  chunk.ts      |  T020 chunk.test.ts

# Polish docs/config — all parallel:
T034 Dockerfile  | T035 docker-compose  | T036 production-env.md  | T037 CLAUDE.md
```

---

## Implementation Strategy

### MVP first (US1)

1. Phase 1 Setup → Phase 2 Foundational (table + model authority).
2. Phase 3 US1 (`semantic_search_products`). Seed a few `product_embeddings` rows (or run the US2 endpoint once) and **validate**: a descriptive query returns distinct relevant products; off-topic returns `[]`.

### Incremental delivery

1. Foundation → US1 (search works on seeded data) — MVP demo.
2. US2 → the index self-maintains on info refresh and survives outages.
3. US3 → backfill the existing catalog in one shot.
4. Polish → prod image bake, env wiring, docs, full validation + threshold tuning.

---

## Notes

- Drizzle query builder throughout (including `vector(384)` + `cosineDistance`); **no `db.execute()`** (constitution III; research D6).
- The migration is additive; `CREATE EXTENSION IF NOT EXISTS vector;` is hand-prepended for self-contained prod apply.
- The model is loaded in exactly one process (`mcp-server`); the worker/backfill never embed — they only enqueue/POST (RAM budget, FR-014).
- Reindex must never block or fail the metadata/price write (FR-015); it self-heals via BullMQ backoff.
- Terminology: spec.md says **"fragment"**; plan/data-model/tasks/code say **"chunk"** (`chunk_index`, `chunk.ts`) — same thing (one `product_embeddings` row).
- Tests are colocated (`foo.ts` → `foo.test.ts`) with backends mocked at the module boundary; run `pnpm test` + `pnpm lint` before a PR.
