# Phase 0 Research: Extend Product Info Extraction

All Technical Context items were resolvable from the existing codebase and the
clarified spec; there are no open `NEEDS CLARIFICATION` items. This document
records the decisions that shape Phase 1.

---

## 1. Migration workflow: adopt versioned Drizzle migrations safely

**Decision**: Replace the ad-hoc `drizzle-kit push` workflow with **versioned
migrations** (`drizzle-kit generate` → committed SQL + `meta/_journal.json` →
applied with the Drizzle `postgres-js` migrator). Two migrations ship:

1. `0000_*` — a **baseline** capturing the *current* schema, hand-edited so every
   `CREATE TABLE`/`CREATE …` uses `IF NOT EXISTS`.
2. `0001_*` — the **additive** feature change (`ALTER TABLE products ADD COLUMN
   IF NOT EXISTS …`).

**Rationale** — This is the crux of the user's "must deploy with no issue on both
local dev and production" requirement. The repo has **no** `drizzle/` folder
today; every existing database (the developer's local Postgres and the
production droplet) was created with `push`, so its tables already exist but no
migration journal does. A naive first `generate` emits a full-schema `CREATE
TABLE …` migration; running it unguarded against those populated databases would
fail with *"relation already exists"*.

Guarding the baseline with `IF NOT EXISTS` makes it a **no-op on existing
databases** and a **full create on fresh ones** (CI, a new contributor, a fresh
prod volume). The additive `0001` uses `ADD COLUMN IF NOT EXISTS`, so it is
idempotent and re-run safe (FR-022). The migrator records each applied migration
in its journal table, so a database already up to date is left untouched (a
deploy with nothing pending is a true no-op, SC-007).

**Adoption sequence** (one-time, performed during implementation):
1. `pnpm --filter @price-monitor/db generate` against the *unchanged* schema →
   `0000_*.sql`; edit its DDL to `IF NOT EXISTS`.
2. Add the new columns to `schema.ts`.
3. `generate` again → `0001_*.sql`; confirm it only contains `ADD COLUMN`
   (tighten to `ADD COLUMN IF NOT EXISTS`).
4. Apply locally with `migrate` and confirm existing data + price history are
   intact.

**`push` retained as a dev convenience** (decided 2026-06-13): the canonical,
shippable path is `generate` + committed migrations + `migrate`, but the
`drizzle-kit push` script stays available for quick local schema prototyping. It
MUST NOT be used to deliver schema changes — anything that reaches `dev`/`main`
goes through a reviewed, journalled migration (FR-021).

**Alternatives considered**:
- *`push` as the delivery mechanism* — rejected: not reviewable in a PR, not
  journalled, not reproducible across environments; fails FR-021/022/023.
- *Generate only the additive migration, no baseline* — impossible without a
  baseline snapshot; `generate` would emit the full schema as the first
  migration anyway.
- *Seed the journal table to mark a baseline "already applied"* on existing DBs —
  rejected: more moving parts and an error-prone manual SQL step on prod, versus
  a self-contained `IF NOT EXISTS` baseline that needs no special handling.

---

## 2. Auto-apply on deploy: gated single instance

**Decision**: Run pending migrations programmatically at **worker startup**,
before the BullMQ `Worker` begins consuming jobs, gated by a new
`RUN_MIGRATIONS` env flag. Exactly one instance sets `RUN_MIGRATIONS=true` — the
same single instance that already owns `ENABLE_SCHEDULER=true`. A standalone
manual command (`pnpm --filter @price-monitor/db migrate`) remains for local dev
and as a production fallback (runnable in Coolify's container/database terminal).

**Rationale** — FR-023 explicitly asks for "the existing single-instance
scheduler pattern". The worker already has a gated singleton (`ENABLE_SCHEDULER`)
and a clean startup sequence in `apps/worker/src/index.ts`; hooking the migrate
step in *before* `worker`/scheduler start gives "migrate before consuming jobs"
for free. Migration is synchronous and blocking; on failure the process exits
non-zero so a broken deploy is loud rather than silently serving against a stale
schema.

**Web-reads-before-migrated note** — `web` and `worker` are independent Coolify
apps that redeploy near-simultaneously, and `web`'s Drizzle `select()` will
reference the new columns. Because the change is **additive and nullable** and
the migration is a fast metadata-only `ALTER` (no table rewrite, no backfill),
the inconsistency window is sub-second on this single-droplet topology. This is
the accepted trade-off, consistent with how the project already treats
single-instance gating; the manual apply path is the documented fallback if a
deploy ever needs migrations applied ahead of the web rollout. (At this scale we
do not introduce a separate pre-deploy migration job/container.)

**Alternatives considered**:
- *Run migrations from `web` startup* — rejected: Next.js standalone has no clean
  single-run pre-serve hook across replicas; the worker is the natural singleton.
- *Separate one-shot migration container/Coolify pre-deploy command* — rejected
  as over-engineered for a 3-app single droplet; revisit if the topology scales.

---

## 3. Metadata extraction: extend the AI tier, reuse rendered HTML

**Decision**: Add `aiExtractProductInfo(url, html)` in `aiExtractor.ts` using an
**extended Zod schema** (existing `title/price/currency/imageUrl` **plus**
`description/category/brand/countryOfOrigin/attributes`) and a richer prompt that
instructs the model to return at most the 100 most relevant attributes. A new
`scrapeProductInfo(url)` renders the page via the existing Playwright singleton
and always routes to the AI extractor (metadata needs full rendered content + AI
reasoning). `playwrightFetcher.ts` already produces `renderedHtml` and calls
`aiExtract`; expose that rendered-HTML path so the metadata route reuses it
without duplicating browser logic.

**Rationale** — Keeps the cheap price path (`scrapeProduct`, Tier 1 → Tier 2)
**completely untouched** (FR-004, SC-002). Metadata is opt-in and only ever
invoked by the new operation. Reusing `generateObject` + Zod keeps extraction
type-safe and consistent with the existing extractor; the 100-cap is enforced
both in the prompt and defensively when persisting.

**Alternatives considered**:
- *Always extract metadata in the normal scrape* — rejected: violates the
  cost/latency decoupling that is the whole point of the feature.
- *Separate metadata-only AI call kept apart from price* — rejected: the spec
  requires "update product info" to record a fresh price **in the same run**;
  one combined extraction is cheaper and atomic.

---

## 4. Attributes storage shape

**Decision**: A single JSONB column `attributes` on `products`, typed via
Drizzle `$type<ProductAttribute[]>()` where
`ProductAttribute = { key: string; value: string }`. A shared Zod schema
(`packages/db/src/attributes.ts`) validates and caps the array at 100; it is
re-exported from `@price-monitor/db` for the worker (write) and web (read/render).

**Rationale** — Clarifications fixed this: single additive JSONB column, no child
table, ≤100 pairs. An **ordered array of `{key,value}`** preserves the
extractor's "most important first" ordering and tolerates near-duplicate keys
better than a plain object map; it renders directly as a key/value list in the
detail dialog. Sharing the type/schema from `packages/db` keeps producer and
consumer in lockstep (Typed Maintainability).

**Alternatives considered**:
- *`Record<string,string>`* — rejected: loses ordering and silently collapses
  duplicate keys.
- *Separate `product_attributes` child table* — rejected by clarification
  (over-normalised for a ≤100 bounded, display-only set).

---

## 5. Two distinct operations and their triggers

**Decision**:
- Keep `check-price` job unchanged (price only).
- Add `update-product-info` job: `scrapeProductInfo` → on success, append a price
  record **and** overwrite the full metadata set (store found fields, blank the
  rest) and set `info_updated_at`; on total failure, record failure and leave
  metadata + `info_updated_at` untouched (FR-008).
- On add, the products `POST` route enqueues `update-product-info` instead of
  `check-price` (FR-007).
- Per-product action → `POST /api/products/[id]/update-info` enqueues the job
  (mirrors check-price route + hook).
- Batch digest carries a `mode` (`"price"` default | `"info"`); `info` makes the
  flow's child jobs `update-product-info` instead of `check-price`.

**Rationale** — Reuses the existing queue, flow producer, route/hook, and
dialog/action patterns; only the field set, persistence, and triggers differ
(spec Assumptions). Overwrite semantics are a deliberate clarification decision.

**Alternatives considered**:
- *Merge-not-overwrite on re-run* — rejected by clarification (overwrite chosen
  so stale fields can't linger).
- *Separate metadata job that doesn't touch price* — rejected: spec requires a
  price in the same run.

---

## 6. Reusable detail dialog + click vs actions-menu disambiguation

**Decision**: One `product-detail-dialog.tsx` consumed by card view, table view,
and dashboard product widgets (FR-014). Card/row click opens it; the actions
dropdown trigger calls `e.stopPropagation()` (and menu-item handlers do too) so
opening the menu never opens the dialog (FR-013). The dialog reads metadata from
the already-loaded `ProductWithStats` (the products page `select()` returns the
new columns automatically once the schema is extended) and surfaces Check
price / Update info actions (FR-015). Missing fields render a placeholder or hide
their section (FR-011). `description` is clamped/truncated in the UI only
(storage keeps full text).

**Rationale** — Matches existing Shadcn dialog/dropdown usage and the
`ProductWithStats` data flow; no extra fetch needed. `stopPropagation` is the
standard pattern for nested interactive triggers inside a clickable container.

**Alternatives considered**:
- *Separate detail route/page* — rejected: a dialog matches the current
  card/table UX and the "single click from any list" success criterion (SC-004).
- *Per-view duplicate dialogs* — rejected (DRY / FR-014 reuse requirement).

---

## 7. Backfill

**Decision**: `scripts/backfill-product-info.ts` (run via `tsx`) enqueues an
`update-product-info` job for every product, letting the worker do the
extraction. Idempotent by construction — re-running just refreshes (overwrite
semantics), with no duplicate side effects beyond a new price record + refreshed
metadata (FR-019, SC-005).

**Rationale** — Reuses the queue and the exact same job as on-demand refresh, so
backfill and normal operation can't diverge. Mirrors the embeddings backfill a
later phase will add.

**Alternatives considered**:
- *Inline synchronous extraction in the script* — rejected: would duplicate
  worker logic and run a browser/AI loop outside the worker's lifecycle.
