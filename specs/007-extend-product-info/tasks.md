---
description: "Task list for Extend Product Info Extraction (Rich Metadata)"
---

# Tasks: Extend Product Info Extraction (Rich Metadata)

**Input**: Design documents from `/specs/007-extend-product-info/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec's *Verification Notes* and the constitution require
automated coverage for persistence, extraction, queue, and user-visible logic.
Tests are colocated (`*.test.ts(x)`) and mock backends at the module boundary.

**Organization**: Grouped by user story for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- Exact file paths are included in each task

## Path conventions

Monorepo: `packages/db/`, `apps/worker/src/`, `apps/web/src/`, `scripts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared types and migration tooling every later phase depends on

- [ ] T001 [P] Create shared attribute type + Zod schema (`ProductAttribute`, `productAttributesSchema`, `MAX_PRODUCT_ATTRIBUTES = 100`) in `packages/db/src/attributes.ts` and re-export them from `packages/db/src/index.ts`
- [ ] T002 [P] Add programmatic migrator `packages/db/src/migrate.ts` (Drizzle `postgres-js` migrator pointed at `./drizzle`, reads `DATABASE_URL`, logs start/applied/up-to-date, exits non-zero on error) and add a `"migrate"` script to `packages/db/package.json`
- [ ] T003 [P] Declare the new `RUN_MIGRATIONS` flag: add it to the root `.env`, and to the `worker` service in `docker-compose.yml` next to `ENABLE_SCHEDULER` (set `"true"` for the single local gated worker)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema change + versioned migrations + gated auto-apply — must exist
before any story can read/write the new fields

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Generate the baseline migration from the **unchanged** schema: `pnpm --filter @price-monitor/db generate` → `packages/db/drizzle/0000_*.sql`; hand-edit its DDL so every `CREATE TABLE`/index/constraint uses `IF NOT EXISTS` (no-op on existing DBs). Commit `drizzle/` incl. `meta/_journal.json`
- [ ] T005 Extend the `products` table in `packages/db/src/schema.ts` with `description` (text), `category` (text), `brand` (text), `countryOfOrigin` → `country_of_origin` (text), `attributes` → `jsonb("attributes").$type<ProductAttribute[]>()`, and `infoUpdatedAt` → `info_updated_at` (timestamp); all nullable (depends on T001, T004)
- [ ] T006 Generate the additive feature migration: `pnpm --filter @price-monitor/db generate` → `packages/db/drizzle/0001_*.sql`; confirm it only `ALTER TABLE products ADD COLUMN …` and tighten each to `ADD COLUMN IF NOT EXISTS`; commit (depends on T005)
- [ ] T007 Apply locally and verify: `pnpm --filter @price-monitor/db migrate` against the existing dev DB; confirm existing products + full price history are intact and new columns are `NULL`; run it a second time to confirm a no-op (depends on T002, T006)
- [ ] T008 Wire gated auto-migrate into worker startup in `apps/worker/src/index.ts`: when `RUN_MIGRATIONS === "true"`, run the migrator (T002) and await completion **before** the BullMQ worker/scheduler start consuming; on failure log and `process.exit(1)` (depends on T002, T006)
- [ ] T009 [P] Verification — schema/type tests: assert the six new columns and types in `packages/db/src/schema.test.ts`, and add `packages/db/src/attributes.test.ts` covering `productAttributesSchema` validation + the 100-item cap (depends on T001, T005)

**Checkpoint**: Schema migrated everywhere; shared types ready — stories can begin

---

## Phase 3: User Story 1 - Enrich a product's information on demand (Priority: P1) 🎯 MVP

**Goal**: A working "update product info" operation (AI tier) that records a price
**and** overwrites the rich metadata + `info_updated_at`, triggered on add and via
a per-product action — while "check price now" stays price-only.

**Independent Test**: Add a product (or click "Update product info") → the row
gains description/category/brand/country/attributes + `info_updated_at` + a new
price; "Check price now" still only adds a price and leaves metadata untouched.

### Verification for User Story 1 ⚠️

- [ ] T010 [P] [US1] Test `aiExtractProductInfo` (mocked AI SDK) returns the extended fields and caps attributes at 100, in `apps/worker/src/services/aiExtractor.test.ts`
- [ ] T011 [P] [US1] Test the `update-product-info` job for success-overwrite (found fields stored, missing blanked, `info_updated_at` set, price appended), partial page, and total failure (metadata + `info_updated_at` untouched, failure logged), in `apps/worker/src/jobs/updateProductInfo.test.ts`
- [ ] T012 [P] [US1] Test `POST /api/products/[id]/update-info` (200 enqueues, 400 invalid id, 404 missing) in `apps/web/src/app/api/products/[id]/update-info/route.test.ts`

### Implementation for User Story 1

- [ ] T013 [P] [US1] Add the richer extraction output shape (price fields + `description`/`category`/`brand`/`countryOfOrigin`/`attributes`) to `apps/worker/src/types/scraper.ts`
- [ ] T014 [US1] Implement `aiExtractProductInfo(url, html)` in `apps/worker/src/services/aiExtractor.ts`: extended Zod `ProductInfoSchema` + enriched prompt (request top-100 attributes, omit unknowns), convert price to cents, validate/cap attributes (depends on T001, T013)
- [ ] T015 [US1] Expose a rendered-HTML path in `apps/worker/src/services/playwrightFetcher.ts` so the metadata route can reuse the singleton browser render without duplicating navigation logic
- [ ] T016 [US1] Implement `scrapeProductInfo(url)` in `apps/worker/src/services/scraper.ts`: render via Playwright (T015) then `aiExtractProductInfo`; keep the existing `scrapeProduct` price path untouched (depends on T014, T015)
- [ ] T017 [P] [US1] Implement `saveProductInfo(productId, metadata)` in `apps/worker/src/services/database.ts` using Drizzle update: overwrite all metadata (blank missing fields), set `info_updated_at = now`, validate + cap `attributes` via `productAttributesSchema` (depends on T001, T005)
- [ ] T018 [US1] Implement the `update-product-info` job processor in `apps/worker/src/jobs/updateProductInfo.ts`: resolve URL → `scrapeProductInfo`; on success append price record + `saveProductInfo` + success log; on total failure record failure + leave metadata untouched (depends on T016, T017)
- [ ] T019 [US1] Register the `update-product-info` case in `apps/worker/src/queue/worker.ts` (depends on T018)
- [ ] T020 [US1] Change on-add behaviour in `apps/web/src/app/api/products/route.ts` to enqueue `update-product-info` instead of `check-price` so new products start enriched (FR-007)
- [ ] T021 [P] [US1] Create `POST /api/products/[id]/update-info` route at `apps/web/src/app/api/products/[id]/update-info/route.ts` mirroring check-price (enqueue `update-product-info`)
- [ ] T022 [P] [US1] Create the `useUpdateInfo` hook in `apps/web/src/app/(main)/dashboard/products/_components/use-update-info.ts` mirroring `use-check-price.ts` (loading/disabled/toast + `router.refresh()`)
- [ ] T023 [US1] Add an "Update product info" dropdown item directly beneath "Check price now" in `apps/web/src/app/(main)/dashboard/products/_components/product-card-view.tsx` (depends on T022)
- [ ] T024 [US1] Add the same "Update product info" dropdown item beneath "Check price now" in `apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx` (depends on T022)

**Checkpoint**: US1 fully functional — enrich on add + on demand; price check unchanged

---

## Phase 4: User Story 2 - View a product's rich details (Priority: P2)

**Goal**: A reusable product detail dialog that surfaces image, name, source link,
price + trend, the new metadata + attributes list, and both refresh timestamps.

**Independent Test**: Click a card and a row → detail dialog opens with metadata
(missing fields graceful) and both timestamps; opening the actions menu does NOT
open the dialog and all existing actions still work.

### Verification for User Story 2 ⚠️

- [ ] T025 [P] [US2] Test `product-detail-dialog` rendering (metadata + attributes list, graceful empty fields, both timestamps shown) and that an actions-menu click does not open the dialog, in `apps/web/src/app/(main)/dashboard/products/_components/product-detail-dialog.test.tsx`

### Implementation for User Story 2

- [ ] T026 [US2] Extend the `ProductWithStats` type with the six new metadata fields in `apps/web/src/app/(main)/dashboard/products/_components/products-view.tsx` (the `products/page.tsx` query already spreads all product columns, so confirm they flow through)
- [ ] T027 [P] [US2] Create the reusable `product-detail-dialog.tsx` in `apps/web/src/app/(main)/dashboard/products/_components/`: image, name, source link, current price + currency, price trend, description (UI-clamped), category/brand/country, attributes key/value list, `info_updated_at` + `lastChecked` timestamps, and "Check price now"/"Update product info" actions; placeholder/hide for missing fields (depends on T022, T026)
- [ ] T028 [US2] Open the dialog on card click and add `e.stopPropagation()` to the dropdown trigger + delete/edit handlers in `product-card-view.tsx` so the menu never opens the dialog (depends on T027)
- [ ] T029 [US2] Open the dialog on row click and stop propagation on the actions cell in `apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx` (depends on T027)
- [ ] T030 [US2] Satisfy the cross-page reuse requirement (FR-014): import `product-detail-dialog.tsx` from the dashboard product listing in `apps/web/src/app/(main)/dashboard/default/page.tsx` (and its `_components/`), or, if that page still uses placeholder `data.json`, add a code comment documenting the placeholder and that the dialog is the shared component to wire in (depends on T027)

**Checkpoint**: US1 + US2 both work — data is captured and viewable from any list

---

## Phase 5: User Story 3 - Batch refresh mode in the digest dialog (Priority: P3)

**Goal**: Replace the dead "Force AI Extraction" toggle with a two-option choice
(price-only default vs info+price) that drives how each product is refreshed
before the digest email.

**Independent Test**: Open "Check All & Send Email" → the fake toggle/caption are
gone and a two-option choice defaults to price; selecting info+price runs the full
metadata refresh per product before the email; default keeps price-only behaviour.

**Depends on US1** (reuses the `update-product-info` job).

### Verification for User Story 3 ⚠️

- [ ] T031 [P] [US3] Test `POST /api/digest/trigger` mode handling (defaults to `price`, accepts `info`) in `apps/web/src/app/api/digest/trigger/route.test.ts`
- [ ] T032 [P] [US3] Test `enqueueRefreshFlowForActiveProducts` child-job selection by mode (`check-price` vs `update-product-info`) in `apps/worker/src/services/update-prices.test.ts`
- [ ] T033 [P] [US3] Test `manual-trigger-button` shows the two-option control (no "(Feature under construction)" caption) and posts the selected mode, in `apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.test.tsx`

### Implementation for User Story 3

- [ ] T034 [US3] Add a `mode: "price" | "info"` parameter to `enqueueRefreshFlowForActiveProducts` in `apps/worker/src/services/update-prices.ts`, selecting child job name `check-price` vs `update-product-info` (default `price`) (depends on T019)
- [ ] T035 [US3] Pass `mode` from `job.data` through `sendDigestJob` to `enqueueRefreshFlowForActiveProducts` in `apps/worker/src/jobs/sendDigest.ts` (scheduled digests default to `price`) (depends on T034)
- [ ] T036 [US3] Accept an optional `{ mode }` body in `apps/web/src/app/api/digest/trigger/route.ts`, coerce anything but `"info"` to `"price"`, and include it in the `send-digest` job data (depends on T035)
- [ ] T037 [US3] Replace the disabled Switch + "(Feature under construction)" caption in `apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.tsx` with a two-option RadioGroup (default "Refresh all products' price"; second "Refresh all products info (info + price)") that posts `mode` (depends on T036)

**Checkpoint**: US1–US3 work — catalogue-wide enrichment available from the digest

---

## Phase 6: User Story 4 - Backfill metadata for existing products (Priority: P3)

**Goal**: A one-time, idempotent backfill that enriches all existing products.

**Independent Test**: Run the backfill on a DB with pre-feature products → they
gain metadata + `info_updated_at`; re-running completes with no errors and just
refreshes (no duplicate side effects).

**Depends on US1** (reuses the `update-product-info` job).

### Verification for User Story 4 ⚠️

- [ ] T038 [P] [US4] Test the backfill enqueues one `update-product-info` per product and is safe to re-run (mocked queue) in `scripts/backfill-product-info.test.ts`

### Implementation for User Story 4

- [ ] T039 [US4] Create `scripts/backfill-product-info.ts` (run via `tsx`) that loads all products via Drizzle and enqueues an `update-product-info` job for each; idempotent by construction (overwrite semantics) (depends on T019)

**Checkpoint**: All user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Document the migration workflow + `RUN_MIGRATIONS` operational flag (auto-apply on the single gated instance, manual fallback `pnpm --filter @price-monitor/db migrate`) in `docs/` and/or `README.md`
- [ ] T041 Run `pnpm test` (all workspaces) and `pnpm lint`; fix any failures and review unsafe autofixes
- [ ] T042 Run `quickstart.md` manual validation: detail dialogs from Products + dashboard, both digest modes end-to-end, and the migration applied against a populated DB (zero data loss)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: depends on Foundational — the feature engine + MVP
- **US2 (Phase 4)**: depends on Foundational; renders data produced by US1
- **US3 (Phase 5)**: depends on US1 (reuses the `update-product-info` job)
- **US4 (Phase 6)**: depends on US1 (reuses the `update-product-info` job)
- **Polish (Phase 7)**: depends on all desired stories being complete

### Critical ordering note (migrations)

T004 (baseline) **must** be generated before T005 adds the new columns, and T006
(additive migration) **after** T005. This produces a clean `0000` baseline +
`0001` additive pair that applies safely on fresh, local, and production DBs.

### Within each story

- Verification tasks defined before implementation; included tests should fail first
- Types/models → services → job/endpoints → UI wiring

### Parallel opportunities

- Setup: T001, T002, T003 all [P]
- Foundational: T009 [P] alongside the sequential migration chain (T004→T005→T006→T007/T008)
- US1 tests T010–T012 [P]; impl T013 and T017 and T021 and T022 are [P] (distinct files)
- US3 tests T031–T033 [P]
- Different stories can proceed in parallel once Foundational is done (US3/US4 after US1's job lands)

---

## Parallel Example: User Story 1

```bash
# Verification (write first, expect red):
Task: "aiExtractProductInfo test in apps/worker/src/services/aiExtractor.test.ts"   # T010
Task: "update-product-info job test in apps/worker/src/jobs/updateProductInfo.test.ts"  # T011
Task: "update-info route test in apps/web/src/app/api/products/[id]/update-info/route.test.ts"  # T012

# Parallel implementation kickoff (distinct files):
Task: "extend extraction output type in apps/worker/src/types/scraper.ts"  # T013
Task: "saveProductInfo in apps/worker/src/services/database.ts"            # T017
Task: "update-info route in apps/web/.../update-info/route.ts"             # T021
Task: "useUpdateInfo hook in apps/web/.../use-update-info.ts"              # T022
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational (schema + migrations applied everywhere)
2. Phase 3 US1 → **STOP & VALIDATE** the enrich operation independently
3. Deploy/demo — products now start and refresh rich; price check unchanged

### Incremental delivery

US1 (MVP) → US2 (detail dialog) → US3 (batch mode) → US4 (backfill). Each story
is an independently testable increment that doesn't break earlier ones.

---

## Notes

- [P] = different files, no incomplete dependency
- [Story] label maps each task to a spec user story for traceability
- The only sanctioned raw SQL lives in the committed `drizzle/` migration files
- Keep the cheap `check-price` path untouched (SC-002); AI tier runs only via `update-product-info`
- Commit after each task or logical group; stop at any checkpoint to validate
