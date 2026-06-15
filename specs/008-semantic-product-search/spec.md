# Feature Specification: Semantic Product Search (pgvector RAG embedding pipeline)

**Feature Branch**: `008-semantic-product-search`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "read @docs/AI-agent-mcp-server-idea.md , we are now doing phase 4, from 4.2 to 4.7. 4.2 is related to spec, plan and tasks in speckit workflow. Then the speckit implement will actually do 4.3 to 4.7 all together. read the doc and do specify first"

## Overview

Today the chat agent can only find products by literal keyword overlap with a
product's name (the existing `search_products` tool does a name `ILIKE` match).
A person who asks the chatbot "find me a gaming monitor good for video editing"
gets nothing useful unless those exact words appear in a product name — even
though feature 007 now stores a rich description, brand, category, country of
origin, and a key/value spec list for every product.

This feature adds **semantic (meaning-based) product search**: the agent can
answer natural-language questions by retrieving the products whose **rich
metadata** is closest in *meaning* to the query, using Retrieval-Augmented
Generation (RAG) over vector embeddings. It is the whole Phase 4 embedding
pipeline — turning each product's 007 metadata into searchable vectors, keeping
those vectors current as metadata changes, backfilling the existing catalog, and
exposing a new semantic-search tool to the chat agent.

The guiding principles, all inherited as **locked decisions** from the Phase 4
roadmap (recorded in *Technical and Operational Constraints* and *Assumptions*
so planning stays consistent):

- **Embed the 007 rich metadata**, not just the name — there is finally enough
  text to make "understands meaning, not keywords" search work.
- **Split each product's text into multiple bounded fragments**, each embedded
  into its own vector, so a long description plus up to 100 specs is never
  silently truncated. Retrieval collapses back to the single best fragment per
  product.
- **Keep semantic search purely semantic.** Price predicates ("cheap", "under
  $200") stay with the existing price tools; this feature does not build a
  hybrid vector+price filter.
- **Regenerate vectors only when metadata is (re)extracted** (the 007
  `update-product-info` operation), with overwrite (delete-and-replace)
  semantics that mirror 007. A plain price-only check never touches vectors.
- **One process owns the embedding model** so its memory cost is paid once and
  the production host stays within its RAM budget.

## Clarifications

### Session 2026-06-15

- Q: How should the search tool decide when nothing is relevant enough, given a non-empty index always has a "nearest" product? → A: Apply a **configurable cosine-distance cutoff** (sensible default, tunable via env). Only matches within the threshold are returned, so an off-topic query yields an empty set.
- Q: How many distinct products should semantic search return by default (top-N)? → A: **Configurable, default 5** (exposed as a tool parameter / env with a default of 5).
- Q: If write-time reindex fails (e.g. embedding service briefly unavailable) after a metadata refresh, how should the system recover without failing the metadata write? → A: Enqueue a **dedicated, retryable reindex job** (queue-backed, with backoff) so the metadata/price write commits immediately and reindex eventually succeeds on its own.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find products by meaning in chat (Priority: P1)

A person tracking products asks the chatbot a descriptive, natural-language
question such as "find me a gaming monitor good for video editing" or "which of
my products is an energy drink". The agent uses a new semantic-search capability
to retrieve the monitored products whose meaning best matches the request — even
when the query words do not literally appear in the product name — and answers
with those products and why they matched, drawing on their rich metadata.

**Why this priority**: This is the headline user value and the whole point of
Phase 4. Without it, the other stories (keeping vectors current, backfilling)
have no observable purpose. It is independently demonstrable: with even a small
indexed catalog, a natural-language query returns relevant products that the old
keyword search would miss.

**Independent Test**: With a handful of products indexed, ask the chatbot a
descriptive query whose words do not appear in any product name (e.g., "a
display for editing video") and confirm the agent returns the semantically
relevant product(s), each as a distinct result with its metadata, and that an
irrelevant catalog returns "nothing found" gracefully rather than an error.

**Acceptance Scenarios**:

1. **Given** several indexed products including one whose description/specs
   describe a high-refresh monitor, **When** the user asks the chatbot "find me a
   gaming monitor good for video editing", **Then** that monitor is returned among
   the top results even though "video editing" is not in its name, with its rich
   metadata available to the agent's explanation.
2. **Given** a product whose long description and many specs would overflow a
   single embedding, **When** the user's query matches content buried deep in the
   specs, **Then** the product is still found (via its best-matching fragment) and
   appears **once**, not once per fragment.
3. **Given** a query no product is within the relevance (distance) threshold of
   (or an empty index), **When** the user asks it, **Then** semantic search returns
   an empty result set with no error and the agent can say nothing relevant was
   found — rather than surfacing the nearest-but-irrelevant product.
4. **Given** a query containing a price predicate such as "cheap gaming monitor",
   **When** the agent handles it, **Then** the semantic part ("gaming monitor")
   drives semantic search while the price part ("cheap") is handled by the
   existing price tools — semantic search itself applies no price filter.

---

### User Story 2 - Vectors stay current with product metadata (Priority: P2)

When a product's rich metadata is (re)extracted — on first add, on an on-demand
"update product info", or in the info+price digest batch — its semantic index is
automatically regenerated from the latest metadata, so search always reflects the
current product. A routine price-only check leaves the index untouched, and
deleting a product removes it from search.

**Why this priority**: Search is only trustworthy if it reflects reality. This
story makes US1 durable over time without manual reindexing, while preserving the
007 cost model (metadata work is occasional; price checks stay cheap).

**Independent Test**: Run "update product info" on a product, change something
observable in its metadata, and confirm a subsequent semantic search reflects the
new metadata; run a price-only "check price now" and confirm the index is
unchanged; delete a product and confirm it no longer appears in results.

**Acceptance Scenarios**:

1. **Given** an indexed product, **When** its metadata is re-extracted via
   "update product info", **Then** its old index fragments are replaced by a fresh
   set computed from the new metadata (delete-and-replace), with no stale fragments
   left behind.
2. **Given** any product, **When** a plain price-only "check price now" runs,
   **Then** the semantic index is not regenerated.
3. **Given** a new product URL is added (which triggers "update product info"
   once on create), **When** it is first enriched, **Then** it is indexed and
   becomes findable by semantic search.
4. **Given** an indexed product, **When** the product is deleted, **Then** its
   index fragments are removed and it no longer appears in semantic-search results.
5. **Given** the embedding authority is temporarily unavailable when a metadata
   refresh completes, **When** reindex cannot run, **Then** the metadata and price
   write still succeed (007 behavior preserved) and the reindex is retried durably via
   its queued job (with backoff) until it succeeds, rather than failing the refresh or
   leaving the index permanently stale.

---

### User Story 3 - Backfill the existing catalog (Priority: P3)

An operator runs a one-off script to index every product that already exists, so
semantic search works across the whole catalog immediately rather than only for
products refreshed after the feature ships.

**Why this priority**: A bridge for the existing catalog. Valuable but one-time;
once run, US2 keeps everything current. It depends on products already having
metadata (the 007 metadata backfill), so it is naturally sequenced last.

**Independent Test**: Run the backfill once and confirm every product with
metadata becomes findable; run it a second time and confirm it completes with no
errors and produces no duplicate index entries.

**Acceptance Scenarios**:

1. **Given** a catalog of existing products whose metadata has been populated,
   **When** the backfill runs, **Then** every such product is indexed and findable
   by semantic search.
2. **Given** the backfill has already run, **When** it is run again, **Then** it
   completes successfully with the same resulting index and no duplicated fragments
   (idempotent, delete-and-replace per product).
3. **Given** the metadata backfill has **not** yet run, **When** the embeddings
   backfill runs, **Then** products are indexed from whatever (thin) metadata they
   have (e.g., name only) without error — the documented run order is metadata
   backfill first.

---

### Edge Cases

- **Product that fits in one fragment**: a product whose composite metadata is
  short produces exactly one index fragment (the multi-fragment design degrades
  gracefully to a single row).
- **Near-empty metadata**: a product with only a name still yields a minimal,
  self-describing document and remains searchable; it is not skipped.
- **Total extraction failure on refresh**: if "update product info" fails entirely
  and leaves metadata untouched (007 semantics), the existing index is left as-is —
  reindex follows a successful metadata write only.
- **Concurrent reindex and query**: a search running during a reindex sees either
  the complete old fragment set or the complete new one, never a half-written mix
  (the replace is applied atomically).
- **Empty index / fresh database**: searching before anything is indexed returns
  no results with no error.
- **Off-topic query against a populated index**: a query unrelated to anything in
  the catalog returns an empty set because no product's best fragment falls within the
  relevance (distance) threshold — the tool does not surface the nearest-but-irrelevant
  product just because it is closest.
- **Long content not lost**: a description plus up to 100 specs that exceeds the
  embedding input window is represented across multiple fragments; no content is
  silently truncated away.
- **Duplicate suppression**: a product whose multiple fragments all rank highly
  appears only once in results (collapsed to its best fragment).
- **Embedding-provider change**: vectors from different models occupy different
  spaces and dimensions; mixing them is not a supported state — switching providers
  is a deliberate, documented operation (resize the vector store + re-backfill +
  rebuild the index), never a free runtime toggle.

## Requirements *(mandatory)*

### Functional Requirements

**Semantic search (US1)**

- **FR-001**: The system MUST provide a semantic product-search capability that,
  given a natural-language description, returns the monitored products whose
  meaning is closest to the description, ranked by semantic relevance.
- **FR-002**: Semantic search MUST be exposed to the chat agent as a tool so a
  user can ask descriptive questions in chat and receive relevant products,
  alongside the existing product/price tools.
- **FR-003**: Matching MUST be based on the meaning of a product's **rich
  metadata** (name, brand, category, country of origin, description, and key/value
  specs), not only literal keyword overlap with the product name.
- **FR-004**: Search MUST return at most a **configurable top-N** (default **5**)
  set of **distinct** products (no product appearing more than once), each
  accompanied by its rich metadata so the agent can explain the match. The top-N
  limit MUST be adjustable (tool parameter and/or environment) without code change.
- **FR-005**: When a product is represented by multiple indexed fragments, search
  MUST collapse it to its single best-matching fragment so long products are
  neither duplicated in results nor unfairly penalized.
- **FR-006**: Semantic search MUST apply semantic similarity only; price-based
  predicates (e.g., "cheap", "under $200") are handled by the existing price tools
  and MUST NOT be implemented as a vector filter in this feature.
- **FR-007**: Search MUST apply a **configurable similarity (cosine-distance)
  threshold**: only products whose best fragment falls within the threshold are
  returned. When no product is within the threshold — including when the index is
  empty — search MUST return an empty result set gracefully (no error) so the agent
  can report that nothing relevant was found. The threshold MUST have a sensible
  default and be tunable via environment without code change.

**Index construction & freshness (US2)**

- **FR-008**: The system MUST build each product's searchable text as a composite
  document assembled from its 007 metadata in priority order: **name → brand →
  category → country of origin → description → key/value specs**.
- **FR-009**: Because that document commonly exceeds the embedding model's input
  window, the system MUST split it into multiple bounded fragments and index each
  fragment independently, so no metadata is silently truncated or lost.
- **FR-010**: The system MUST regenerate a product's semantic index whenever that
  product's rich metadata is (re)extracted — i.e., on the "update product info"
  operation (on add, on demand, or in the info+price digest batch) — and MUST NOT
  regenerate it on any other event.
- **FR-011**: A price-only "check price now" (and the price-only digest refresh)
  MUST NOT trigger reindexing.
- **FR-012**: Reindexing MUST use overwrite semantics that mirror 007: delete the
  product's existing index fragments and insert the freshly computed set, so stale
  fragments never linger.
- **FR-013**: When a product is deleted, its index fragments MUST be removed.
- **FR-014**: The embedding model MUST be loaded in exactly one process (the single
  embedding authority); both query-time embedding (search) and write-time embedding
  (reindex/backfill) MUST go through that authority so the model's memory cost is
  paid once.
- **FR-015**: A failure to (re)index a product MUST NOT fail or block the
  underlying metadata/price write. Reindexing MUST be performed via a **dedicated,
  retryable reindex job** (queue-backed, with backoff) so the metadata/price write
  commits immediately and a transient embedding-side failure is retried durably until
  it succeeds, rather than leaving the index silently stale. Exhausted retries MUST be
  logged so they can be diagnosed and recovered (e.g. via the backfill).

**Backfill (US3)**

- **FR-016**: The system MUST provide a one-off backfill that (re)indexes every
  existing product, intended to run after the 007 metadata backfill has populated
  product fields.
- **FR-017**: The backfill MUST be idempotent — a second run produces the same
  index with no duplicate fragments and no errors (delete-and-replace per product).

**Configuration & portability**

- **FR-018**: The embedding approach MUST be selectable via a provider
  configuration with a default local option, mirroring the existing AI-provider
  selection pattern.
- **FR-019**: The vector store MUST accommodate a model-determined vector
  dimension, and switching the embedding provider MUST be supported as a deliberate,
  documented operation (resize the vector dimension, re-run the backfill, rebuild the
  similarity index) rather than a free runtime toggle.

### Key Entities *(include if feature involves data)*

- **Product (existing, source of text)**: the tracked item; its 007 rich metadata
  (name, brand, category, country of origin, description, key/value specs) is the
  source for the composite document. Unchanged by this feature except as the
  upstream trigger for reindexing.
- **Product embedding fragment (new)**: one record per (product, fragment). Holds
  the owning product reference (removed when the product is deleted), the fragment's
  position/index, the fragment's text content, and its embedding vector. A product
  has one or more such records; a short product has exactly one.
- **Composite document (concept)**: the assembled, priority-ordered metadata text
  for a product that is split into the fragments above.
- **Reindex operation (concept)**: the delete-and-replace of a product's fragments,
  triggered by a successful metadata (re)extraction or by the backfill. At write-time
  it runs as a **dedicated, retryable queued job** so it is decoupled from (and never
  blocks) the metadata/price write.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `packages/db` (new embeddings table + additive versioned
  migration; the vector extension must be enabled), `apps/mcp-server` (the single
  embedding authority — owns the model, composite-document assembly, chunking,
  embedding, the embeddings table for reads and writes, the new semantic-search tool,
  and an internal reindex entry point), `apps/worker` (calls reindex after
  "update product info" writes metadata), `scripts/` (embeddings backfill), and
  `specs/`.
- **Data and Contracts Impact**: a new table holding **one row per (product,
  fragment)** with a fixed-dimension vector column and a nearest-neighbor similarity
  index, plus a cascade-on-delete relationship to products; introduced by an
  **additive, versioned, committed migration** applied on deploy by the single gated
  instance (the existing `RUN_MIGRATIONS` pattern), with a manual apply fallback. The
  vector extension must be present (already enabled locally in 4.1; production
  enablement documented). New surfaces: a `semantic_search_products` agent tool (with
  a configurable top-N default 5 and a configurable cosine-distance relevance
  threshold), an internal mcp-server reindex entry point, and a **dedicated retryable
  reindex job** the worker enqueues after a metadata refresh (and the backfill drives).
  The existing price-check, metadata, digest, and `search_products` contracts are
  unchanged.
- **Operational Impact**: the embedding model is loaded in exactly one process
  (`mcp-server`); per the locked Phase 4 RAM analysis (recorded in project memory)
  the local model adds roughly 300 MB resident and fits the production droplet's
  established headroom — there is no second model load. Query-time embedding is local
  and fast; write-time reindex is an occasional extra hop (worker → mcp-server) whose
  cost is acceptable because metadata refreshes are infrequent. Reindexing **MUST NOT
  block or fail** the metadata/price pipeline: it runs as a dedicated, queue-backed
  retryable job (with backoff) so a transient embedding-side failure self-heals rather
  than leaving the index stale; structured logging covers reindex and search outcomes;
  an empty index or a below-threshold query degrades to "no results" rather than an
  error. Changing the embedding provider is a deliberate multi-step operation
  (dimension resize + re-backfill + index rebuild), not a runtime switch.
- **Inherited (locked) technical decisions** — established in the Phase 4 roadmap
  before this spec and not re-litigated here: local embedding model as the default
  path (called directly, not via the AI SDK), token-accurate chunking into ~200-token
  fragments with small overlap and an optional per-fragment product-identity prefix, a
  dedicated per-(product, fragment) table (never an array-of-vectors column) so the
  similarity index can work on a single vector column, an HNSW-style nearest-neighbor
  index, dedup-to-best-fragment-per-product retrieval using cosine distance, reindex
  triggered by `update-product-info` completion, the `mcp-server` as the sole
  embedding host, and a provider abstraction with the local model as default. No
  content-hash "skip if unchanged" optimization is included at the current dataset
  size.
- **Verification Notes**: automated coverage for composite-document assembly order,
  chunking (bounded fragments, overlap, no content loss, single-fragment degradation),
  delete-and-replace reindex, the trigger boundary (reindex on metadata refresh but
  **not** on price-only check), best-fragment-per-product dedup in query results, the
  relevance-threshold cutoff (below-threshold/off-topic query returns empty) and
  configurable top-N, the retryable reindex job (a transient failure is retried, not
  swallowed, and never fails the metadata write), empty-index behavior, deletion
  cleanup, and backfill idempotency. Backend
  dependencies (model, database, queue) are mocked at the module boundary per the
  repository's test convention. Manual validation (roadmap 4.8): ask the chatbot a
  natural-language query and confirm relevant products are returned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can ask a natural-language product question in the chat and
  receive semantically relevant monitored products, **including** cases where the
  query words do not literally appear in any product name (e.g., "a display for
  editing video" surfaces a relevant monitor).
- **SC-002**: Semantic-search results contain only **distinct** products (no product
  appears more than once) and never exceed the configured top-N (default 5); an
  off-topic query (nothing within the relevance threshold) returns an empty set rather
  than an irrelevant nearest match.
- **SC-003**: After a product's info is refreshed, a subsequent semantic search
  reflects the updated metadata, and a price-only check produces **no** change to
  that product's index.
- **SC-004**: Deleting a product removes it from semantic-search results.
- **SC-005**: Running the backfill once makes every product that has metadata
  findable; running it a second time completes with no errors and produces no
  duplicate index entries.
- **SC-006**: No regression to existing flows — routine price checks, metadata
  refresh, and digests behave exactly as before, and a failure to (re)index never
  fails a metadata write or a price check.
- **SC-007**: No metadata is silently dropped from the index because of length —
  products with long descriptions and/or many specs are represented across multiple
  fragments and remain findable on content from anywhere in that text.
- **SC-008**: Enabling the feature keeps the production host within its established
  RAM headroom (a single model load), with no need to upgrade the droplet.
- **SC-009**: Semantic search is fast enough to feel interactive in chat — a search
  over the production-sized catalog returns within a couple of seconds so the
  conversational experience is not noticeably delayed.
- **SC-010**: A transient reindex failure (embedding authority briefly unavailable)
  is recovered automatically — the queued reindex job retries and the product's index
  becomes current with no manual intervention — while the triggering metadata/price
  write still succeeds.

## Assumptions

- **Vector extension available**: the database vector extension is enabled (done
  locally in roadmap 4.1; production enablement is documented as part of this work).
- **Metadata-first run order**: the 007 metadata backfill runs before the embeddings
  backfill so products have rich text to embed; if not, products are indexed from
  whatever thin metadata they have (e.g., name only) without error.
- **Default local embeddings**: the default path uses a local embedding model owned
  by the `mcp-server`; alternative providers exist behind the provider abstraction but
  switching is a deliberate, documented migration (different vector space and
  dimension).
- **Single embedding authority**: the `mcp-server` is the only process that loads the
  model and owns chunking/embedding and the embeddings table for both query-time and
  write-time, so the RAM cost is paid once.
- **Durable, decoupled indexing**: reindexing is decoupled from the metadata/price
  write and runs as a dedicated, retryable queued job; an embedding-side failure is
  retried with backoff (and logged if retries are exhausted), never propagated as a
  refresh failure (007 metadata/price behavior is preserved exactly).
- **Always re-embed on info refresh**: at the current dataset size every metadata
  refresh re-embeds the product (delete-and-replace); no content-hash skip
  optimization is built now (it can be revisited under later cost work).
- **Reuse existing infrastructure**: the feature reuses the existing chat agent,
  tool-calling path, queue, provider-selection convention, and 007 triggers; the chat
  UI surfaces the new tool automatically with no new chat-page UI work.
- **No auth changes**: consistent with the rest of the app, no new authentication is
  added to the search tool or the internal reindex entry point (deferred app-wide).
- **Out of scope**: the Smart Deal Analyzer email insight (Phase 5), hybrid
  vector+price filtering inside the search tool, content-hash reindex skipping, and an
  evals/observability harness (Phase 6) are explicitly not part of this feature.
