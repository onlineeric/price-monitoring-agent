# Phase 0 Research: Semantic Product Search

This document resolves the three items `/speckit-clarify` deferred to planning, plus
the supporting technology decisions. Decisions already **locked** in the Phase 4
roadmap (model, chunking, multi-vector table, HNSW, embed-host, provider abstraction)
are not re-litigated — they are cited as constraints.

---

## Decision 1 — Worker → mcp-server reindex transport: dedicated internal HTTP endpoint (NOT an MCP tool)

**Decision**: The mcp-server exposes a new **plain HTTP route `POST /internal/reindex`**
(`{ productId }` → `{ productId, chunks }`) on its existing `node:http` server in
`transports/http.ts`, alongside `/health` and `/mcp`. The worker reaches it via a
durable `reindex-product-embeddings` BullMQ job whose handler does one `fetch` to
`MCP_REINDEX_URL`. It is **not** registered as an MCP tool.

**Rationale**:
- **Keep writes off the agent's tool surface.** MCP tools are exposed to the LLM. Reindex
  is an internal write mechanism with no conversational value; making it a tool invites the
  agent to call it and enlarges the guardrail surface (spec §Security). `/health` already
  sets the precedent of a server-owned non-MCP route.
- **The worker has no MCP client today** (confirmed: only test-file references to mcp-server
  exist in `apps/worker`). A single `fetch` to a documented endpoint is far less surface than
  adding an MCP client + transport to the worker just to call one internal operation.
- **Reuses the locked design.** The roadmap says the worker and backfill call "an internal
  mcp-server reindex endpoint" — this is that endpoint.

**Env to avoid the PR #47 (3.22) footgun**: the worker uses a **dedicated, full-URL** env
`MCP_REINDEX_URL` (e.g. `http://price-monitor-mcp-prod:3002/internal/reindex`) rather than
reusing the web app's `MCP_HTTP_URL` (which means the `/mcp` JSON-RPC endpoint). Different
service, different need, unambiguous variable — no base-vs-path guessing.

**Alternatives considered**:
- *Reindex as an MCP tool over the existing `/mcp` transport* — rejected: exposes a write op to
  the LLM and forces an MCP client into the worker.
- *mcp-server runs its own BullMQ Worker consuming a reindex queue* — rejected: turns the
  deliberately stateless, horizontally-scalable request service into a background consumer; if
  mcp-server ever scales to >1 replica each would load the model and compete for jobs. Keeping
  the queue/retry in the worker preserves mcp-server's single-replica, request/response shape.
- *Worker embeds inline (loads the model itself)* — rejected: violates the locked single-model-
  authority RAM decision (~300 MB paid twice).

---

## Decision 2 — Reindex durability: retryable BullMQ job (the /speckit-clarify answer, wired)

**Decision**: After a **successful** `update-product-info`, the worker **best-effort enqueues**
a `reindex-product-embeddings` job (`{ productId }`) onto the existing `price-monitor-queue`.
A new handler `reindexEmbeddings.ts` POSTs to `MCP_REINDEX_URL`; a non-2xx/throw bubbles up so
BullMQ retries with exponential backoff (`attempts: 5`, `backoff: { type: "exponential", delay:
5000 }`, `removeOnComplete: true`, `removeOnFail: 100`). Enqueue failures (Redis hiccup) are
caught and logged — they **never** fail the metadata/price write (FR-015).

**Rationale**: Satisfies the clarified requirement (durable, decoupled, self-healing) using
infrastructure already present. The metadata write commits immediately; a briefly-down mcp-server
is tolerated because the job retries until it succeeds. Mirrors how `add_product` already enqueues
onto this queue.

**Where the enqueue lives**: in `updateProductInfoJob`'s success branch, *after*
`saveProductInfo` + `updateProductTimestamp` + `logRun`, wrapped in try/catch. The info+price
digest batch fans out to per-product `update-product-info`, so each success enqueues its own
reindex — the batch is covered with no special-casing (FR-010).

**Alternatives considered**: inline retries then log (no durability across worker restarts);
log-only relying on the next refresh/backfill (index can lag indefinitely). Both rejected by the
clarify answer.

---

## Decision 3 — Production model provisioning: bake weights into the mcp-server image

**Decision**: Pre-download `all-MiniLM-L6-v2` (int8) **at Docker build time** into a known cache
dir baked into the image; keep **lazy in-process initialization** (the model singleton is built on
first embed call). Configure Transformers.js with `env.cacheDir = EMBEDDING_CACHE_DIR` and, in
production, `env.allowRemoteModels = false` so a running container never reaches out to the HF Hub.

**Rationale**:
- **Deterministic, offline-safe cold start.** No runtime dependency on `huggingface.co`; the first
  chat search after a deploy isn't gated on a network download, and a Hub outage can't break search.
- **"Lazy-loaded on first use" (roadmap) is orthogonal** — it governs *when in the process* the
  pipeline is constructed (so importing the module is side-effect-free, matching the project's lazy
  patterns), not *whether weights ship in the image*. We keep lazy init **and** bake weights.
- The int8 MiniLM is small (~25–30 MB), so the image-size cost is negligible.

**Implementation note (Dockerfile)**: add a build step that runs a tiny warm script (or relies on
the first `pipeline()` call) to populate `EMBEDDING_CACHE_DIR`, set `ENV EMBEDDING_CACHE_DIR=…` and
`ENV TRANSFORMERS_OFFLINE`/`allowRemoteModels=false` for runtime. Dev keeps remote download + a
local cache (first run pulls once).

**Alternatives considered**: lazy runtime download to a **persistent Coolify volume** — workable but
adds a volume to manage and still fails the first request after a cache wipe; baking is simpler and
more reproducible for a model this small.

---

## Decision 4 — Chunk identity prefix: yes, prepend product identity to every chunk

**Decision**: Prepend a short identity line — `"{name} — {brand} ({category})"` (omitting absent
fields) — to **each** chunk's text before embedding, and store that prefixed text as the row's
`content`. The composite document still leads with identity, but the prefix guarantees a chunk that
landed entirely in the spec list is still self-describing.

**Rationale**: The roadmap flags this as "consider"; for multi-chunk products a specs-only chunk
embedded without identity drifts semantically (a row of dimensions with no product noun). The prefix
is cheap (~10–15 tokens) and measurably improves best-chunk retrieval. Storing the prefixed text as
`content` keeps "what was embedded" == "what is stored" for debuggability.

**Cost check**: prefix tokens count against the ~200-token budget; the splitter is configured so
`chunkSize` accounts for the prefix, keeping each embedded string within MiniLM's ~256-token window.

---

## Decision 5 — Chunking library & token accuracy

**Decision**: `@langchain/textsplitters` `RecursiveCharacterTextSplitter` with a **token length
function** backed by the MiniLM tokenizer (from `@huggingface/transformers`): `chunkSize ≈ 200`
tokens, `chunkOverlap ≈ 20–40` tokens. Split recursively on paragraph/line/sentence boundaries so
chunks fall on natural seams, then verify token counts with the tokenizer.

**Rationale**: Roadmap-locked ("purpose-built splitter; token-accurate boundaries using MiniLM's
tokenizer"). Character/word counts only approximate tokens and can overflow the window and trigger
MiniLM's silent truncation — the exact failure we're avoiding. A battle-tested splitter beats a
bespoke one (constitution II + Delivery Constraints).

**Alternatives considered**: naive character splitting (overflow risk); a bigger-window model (breaks
the locked RAM budget).

---

## Decision 6 — Vector storage, index, and query (Drizzle-native, no raw SQL)

**Decision**:
- Column: Drizzle `vector("embedding", { dimensions: 384 })` (confirmed available in `drizzle-orm@0.45.1`).
- Index: HNSW with `vector_cosine_ops` via Drizzle's index builder `.using("hnsw", …)`.
- Query: `cosineDistance(productEmbeddings.embedding, queryVec)` (Drizzle helper → `<=>`), used in the
  `orderBy`, the threshold `where` (`lte(distance, maxDistance)`), and the dedup. Best-chunk-per-product
  dedup via `selectDistinctOn([productId])` ordered by `(productId, distance)`, then an outer order by
  distance with `limit(topN)` — or an equivalent `ROW_NUMBER()` window. No `db.execute()`.

**Rationale**: Constitution III prefers the query builder; Drizzle 0.45 exposes exactly the pgvector
helpers needed, so the only non-builder SQL is the migration DDL. `CREATE EXTENSION IF NOT EXISTS
vector;` is **hand-prepended** to the generated migration so prod (`RUN_MIGRATIONS=true`) is
self-contained; locally the init script already created it (idempotent either way).

**Alternatives considered**: raw `db.execute(sql\`… <=> …\`)` — unnecessary given the helpers, and it
would need a documented constitution exception. IVFFlat index — rejected by the locked HNSW decision
(no `lists` tuning, better recall on a small, frequently-rebuilt set).

---

## Decision 7 — Relevance threshold & top-N (the other two /speckit-clarify answers)

**Decision**: `SEMANTIC_SEARCH_MAX_DISTANCE` (cosine distance cutoff, default tuned in 4.8 — start
~`0.55`) filters out below-threshold matches so an off-topic query returns empty (FR-007).
`SEMANTIC_SEARCH_TOP_N` (default `5`) caps distinct products (FR-004). Both are env-tunable and also
accepted as an optional `limit` tool parameter for top-N. The threshold is applied **before** dedup
so a product only survives if its *best* chunk is within range.

**Rationale**: Encodes the clarified answers; keeps tuning out of code (the default distance will be
calibrated during 4.8 end-to-end testing against real catalog queries).

---

## Decision 8 — Embedding provider abstraction (default local; API providers optional)

**Decision**: A `provider.ts` seam exposes `embedTexts(string[]) → number[][]`, `embedQuery(string)
→ number[]`, and `dimensions`. `EMBEDDING_PROVIDER=local` (default) uses `local.ts` (Transformers.js,
384-dim) and is the path implemented and exercised by 4.8. `openai` (1536-dim) and `google` (768-dim)
are implemented behind the same seam via the Vercel AI SDK `embedMany`, but switching is a deliberate
op (different dimension ⇒ migration to resize `vector(N)` + re-run backfill + rebuild HNSW), exactly
as the roadmap states. Adding those providers requires installing `ai` + the adapter in `apps/mcp-
server` (it has none today) — listed as a [Manual] dep install, only if/when used.

**Rationale**: Mirrors the existing `AI_PROVIDER` convention and the locked provider-abstraction
decision while keeping the default build dependency-light.

---

## Resolved unknowns summary

| Unknown (from plan Technical Context / clarify deferrals) | Resolution |
|---|---|
| Worker→mcp-server reindex mechanism | Dedicated `POST /internal/reindex` HTTP route; worker calls it via a retryable job (D1) |
| Reindex failure recovery | Retryable `reindex-product-embeddings` BullMQ job, best-effort enqueue (D2) |
| Prod model provisioning | Bake int8 weights into the mcp-server image; lazy in-process init; offline at runtime (D3) |
| Per-chunk identity prefix | Yes — prepend `name — brand (category)` to each chunk (D4) |
| Chunker | LangChain `RecursiveCharacterTextSplitter`, token-accurate via MiniLM tokenizer (D5) |
| Vector column/index/query | Drizzle `vector(384)` + HNSW `vector_cosine_ops` + `cosineDistance`; no `db.execute()` (D6) |
| Threshold / top-N | `SEMANTIC_SEARCH_MAX_DISTANCE` (~0.55, tune in 4.8) / `SEMANTIC_SEARCH_TOP_N` (5) (D7) |
| Provider abstraction scope | `local` implemented + default; openai/google behind the seam, optional deps (D8) |

All NEEDS CLARIFICATION items are resolved — ready for Phase 1.
