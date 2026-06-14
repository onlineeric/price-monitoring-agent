# Feature Specification: Extend Product Info Extraction (Rich Metadata)

**Feature Branch**: `007-extend-product-info`  
**Created**: 2026-06-13  
**Status**: Draft  
**Input**: User description: "read @specs/007-extend-product-info-idea.md idea spec. create new working branch from current branch."

## Overview

Today each tracked product stores almost no descriptive text — effectively just a
name, a URL, and an image — while the extraction pipeline only pulls title, price,
currency, and image. This makes the product tracker feel thin and, critically,
caps the quality of any future "understands meaning, not keywords" semantic search:
there is nothing rich to search over.

This feature captures and stores **rich product metadata** (a description,
category, brand/manufacturer, country of origin, and a flexible set of key/value
specifications) alongside the price, and surfaces it in the UI. The guiding
principle is to **decouple slow-changing metadata from fast-changing price**: price
keeps being refreshed cheaply and frequently, while the more expensive metadata
extraction runs only when it adds value (when a product is first added, or on
explicit demand).

## Clarifications

### Session 2026-06-13

- Q: On a re-run of "update product info", what happens to a metadata field that was previously captured but the page no longer provides? → A: Overwrite — a successful run replaces the full metadata set; fields not found this run are blanked, even if previously populated. (Price-only "check price now" never touches metadata.)
- Q: What is the maximum number of key/value spec attributes kept per product? → A: At most 100; if the page yields more, the extractor is instructed to return only the 100 most important / most relevant attributes.
- Q: How are the flexible key/value spec attributes persisted? → A: A single additive JSONB column on the `products` table (no separate child table).
- Q: What length bound applies to the stored description? → A: No hard limit — store the full extracted description; the UI clamps/truncates it for display.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enrich a product's information on demand (Priority: P1)

A person tracking a product wants more than just its price. From a product's
actions menu they trigger **"Update product info"**. The system reads the product
page, extracts the rich metadata (description, category, brand, country of origin,
and key specs) **and** records a fresh price, then stores everything against the
product. The same enrichment runs automatically the first time a product is added,
so newly tracked products start out rich.

**Why this priority**: This is the foundation of the whole feature. Without the
ability to capture and store rich metadata, none of the UI or batch work has data
to show. It is independently valuable: even with no UI changes, the product records
become meaningfully richer.

**Independent Test**: Add a new product (or click "Update product info" on an
existing one) and confirm the product record now carries a description, category,
brand, country of origin, and/or spec attributes where the page provides them, a
new price record, and an "info last updated" timestamp — while a plain "Check price
now" still only adds a price record and leaves metadata untouched.

**Acceptance Scenarios**:

1. **Given** a product page that lists a description, brand, and category, **When**
   the user triggers "Update product info", **Then** the product record is updated
   with those fields, a new price record is added, and the "info last updated"
   timestamp is set to now.
2. **Given** any product, **When** the user triggers "Check price now", **Then**
   only a new price record is added and the metadata fields and "info last updated"
   timestamp are left unchanged.
3. **Given** a new product URL is added to tracking, **When** it is first created,
   **Then** the full info extraction runs once so the product starts with metadata
   and a price.
4. **Given** a product page that only lists some of the fields, **When** "Update
   product info" runs, **Then** the fields that are found are stored and the
   remaining fields are written empty (overwrite semantics — any previously
   captured value for a now-missing field is blanked), with no failure.

---

### User Story 2 - View a product's rich details (Priority: P2)

A person browsing their tracked products wants to see everything captured about a
product in one place. Clicking a product card or table row opens a **product detail
dialog** showing the image, name, a link to the source URL, the current price and
currency, a price trend, and the new metadata — description, category, brand,
country of origin, and the spec attributes as a readable key/value list. The dialog
also shows when the info and the price were each last refreshed.

**Why this priority**: This turns the captured data into something a user can
actually see and benefit from, making the app feel like a real product tracker
rather than a price-only scraper. It depends on Story 1 producing data but is
independently testable (empty fields render gracefully).

**Independent Test**: Click a product card and a row; confirm a detail dialog opens
showing the captured metadata with empty fields handled gracefully, that the source
URL is a working link, that both "info last updated" and "price last checked" times
are shown, and that opening the actions menu (Check price / Update info / Edit /
Delete) does **not** also open the detail dialog.

**Acceptance Scenarios**:

1. **Given** an enriched product, **When** the user clicks its card or row, **Then**
   a detail dialog opens showing image, name, source link, current price + currency,
   price trend, description, category, brand, country of origin, and spec attributes.
2. **Given** a product missing some metadata, **When** its detail dialog opens,
   **Then** missing fields are shown as a placeholder or hidden rather than showing
   broken/empty UI.
3. **Given** a product card/row with an actions menu, **When** the user opens the
   actions menu, **Then** the detail dialog does not open and the existing actions
   (Check price now, Update product info, Edit, Delete) continue to work.
4. **Given** the detail dialog is open, **When** the user reads the metadata,
   **Then** both "info last updated" and "price last checked" timestamps are visible
   so the two refresh operations are distinguishable.

---

### User Story 3 - Batch refresh all products before the email digest (Priority: P3)

A person using the dashboard "Check All & Send Email" action wants to choose what
gets refreshed before the digest is sent. The current dialog shows a non-functional
"Force AI Extraction" toggle labelled "(Feature under construction)". This is
replaced with a clear choice of two modes: **"Refresh all products' price"**
(the existing behaviour, selected by default) or **"Refresh all products info
(info + price)"** (the new full-metadata refresh for every product). The chosen
mode determines how each product is refreshed before the email digest goes out.

**Why this priority**: It removes dead/confusing UI and gives a one-click way to
enrich the whole catalogue, but the per-product action (Story 1) already delivers
the core capability, so this is a convenience layer.

**Independent Test**: Open the "Check All & Send Email" dialog; confirm the fake
"Force AI Extraction" toggle and its "(under construction)" label are gone and
replaced by a two-option choice defaulting to price-only; selecting "info + price"
runs the full metadata refresh for every product before the digest is sent, while
the default runs the existing price-only digest.

**Acceptance Scenarios**:

1. **Given** the "Check All & Send Email" dialog, **When** it opens, **Then** the
   disabled "Force AI Extraction" toggle and "(Feature under construction)" label
   are no longer present.
2. **Given** the dialog, **When** it opens, **Then** a two-option choice is shown
   defaulting to "Refresh all products' price".
3. **Given** the user selects "Refresh all products info (info + price)" and
   confirms, **When** the batch runs, **Then** every product has its full metadata
   and price refreshed before the digest email is sent.
4. **Given** the user keeps the default "Refresh all products' price" and confirms,
   **When** the batch runs, **Then** the existing price-only digest behaviour is
   unchanged.

---

### User Story 4 - Backfill metadata for existing products (Priority: P3)

The catalogue already contains products added before this feature, which have no
rich metadata. A maintainer runs a one-time backfill that applies the "update
product info" operation across all existing products so the whole catalogue becomes
enriched. The backfill is safe to re-run.

**Why this priority**: Needed so existing products benefit, and it mirrors the
embeddings backfill a later phase will add, but it is a one-off operational task
rather than an everyday user journey.

**Independent Test**: Run the backfill against a database containing pre-feature
products; confirm those products gain metadata and an "info last updated" timestamp,
and that running it a second time completes without errors or duplicate side effects
beyond refreshing the data.

**Acceptance Scenarios**:

1. **Given** existing products with no metadata, **When** the backfill runs, **Then**
   each product is enriched with whatever metadata its page provides and gets an
   "info last updated" timestamp.
2. **Given** the backfill has already run, **When** it is run again, **Then** it
   completes without errors and simply refreshes the metadata (idempotent).

---

### Edge Cases

- **Page provides no metadata at all**: extraction succeeds but finds nothing — under
  overwrite semantics the metadata fields are written empty (any previously captured
  values are blanked), a price is still recorded, and "info last updated" is still set
  (the attempt happened).
- **Page is unreachable / extraction fails entirely**: treated like a failed check
  (failure recorded), metadata and "info last updated" are left unchanged (no
  overwrite), no partial/garbage data is written.
- **Unusually large spec list**: at most 100 key/value spec attributes are kept per
  product; if the page yields more, the extractor is instructed to return only the 100
  most important / most relevant, so a single product cannot bloat storage or the UI.
- **Product with no price history**: the detail dialog still opens and shows current
  price (or a placeholder) with an empty/short trend rather than breaking.
- **Click target ambiguity**: clicking the actions menu trigger opens only the menu;
  clicking elsewhere on the card/row opens only the detail dialog.
- **Concurrent refreshes**: triggering "Update product info" and "Check price now"
  on the same product should not corrupt the record (a price check never clears
  metadata).
- **Migration applied to a populated database**: existing products and their full
  price history remain intact and unchanged; the new fields appear empty until a
  product is enriched. Re-deploying when the database is already up to date is a no-op
  (no error, no data change).
- **Multiple instances start together on deploy**: only the single gated instance
  applies pending migrations; other instances do not race to migrate, and start
  normally once the schema is current.

## Requirements *(mandatory)*

### Functional Requirements

**Data capture**

- **FR-001**: System MUST store, per product, the following optional fields: a
  description (stored in full, no hard length limit — the UI is responsible for
  clamping/truncating it for display), a category, a brand/manufacturer, a country of
  origin, and a flexible set of key/value specification attributes (at most 100 per
  product) persisted as a single JSONB column on the `products` table.
- **FR-002**: System MUST record, per product, when its information (metadata) was
  last extracted, separately from when its price was last checked.
- **FR-003**: The information extraction MUST attempt to capture the new fields from
  the product page and MUST treat every new field as optional, returning only what
  it can find. When the page exposes more than 100 spec attributes, the extractor
  MUST return only the 100 most important / most relevant.
- **FR-004**: Existing price, title, currency, and image extraction behaviour MUST
  remain unchanged.

**Two distinct refresh operations**

- **FR-005**: System MUST keep a "check price" operation that refreshes only price
  (and currency) using the existing fast path, with unchanged behaviour and cost.
- **FR-006**: System MUST provide a distinct "update product info" operation that
  refreshes the full metadata **and** records a new price in the same run.
- **FR-007**: When a new product is first added to tracking, the system MUST run the
  "update product info" operation once so the product starts enriched.
- **FR-008**: The "update product info" operation MUST be best-effort and use
  overwrite semantics: on a successfully processed page it replaces the full metadata
  set — storing whichever fields are found and writing the rest empty, blanking any
  previously captured value for a field the page no longer provides — records a price,
  and sets the "info last updated" timestamp. A run that fails entirely (page
  unreachable / extraction error) leaves the metadata fields and the "info last
  updated" timestamp unchanged.

**Per-product action**

- **FR-009**: Each product's actions menu, in both the card view and the table view,
  MUST offer an "Update product info" item directly beneath "Check price now",
  reusing the existing loading/disabled/confirmation/toast feedback pattern.

**Product detail dialog**

- **FR-010**: Clicking a product card or table row (anywhere except the actions
  menu) MUST open a product detail dialog showing the image, name, a link to the
  source URL, current price + currency, a price trend, and the new metadata
  (description, category, brand/manufacturer, country of origin) plus the spec
  attributes rendered as a readable key/value list.
- **FR-011**: The detail dialog MUST handle missing fields gracefully by showing a
  placeholder or hiding the empty section rather than rendering broken UI.
- **FR-012**: The detail dialog MUST display both the "info last updated" and the
  "price last checked" timestamps so the two refresh operations are distinguishable.
- **FR-013**: Opening a product's actions menu MUST NOT also open the detail dialog,
  and all existing actions (Check price now, Update product info, Edit, Delete) MUST
  continue to work.
- **FR-014**: The detail dialog MUST be reusable across the Products page (card and
  table views) and the dashboard product widgets.
- **FR-015**: The detail dialog SHOULD also surface the per-product actions ("Check
  price now", "Update product info") for convenience.

**Batch refresh in the dashboard digest dialog**

- **FR-016**: The "Check All & Send Email" dialog MUST remove the disabled "Force AI
  Extraction" toggle and its "(Feature under construction)" label.
- **FR-017**: The dialog MUST replace that control with a two-option choice:
  "Refresh all products' price" (default) and "Refresh all products info
  (info + price)".
- **FR-018**: The selected mode MUST drive whether the batch refreshes price-only or
  full metadata for each product before the email digest is sent; the default mode
  MUST preserve the existing price-only digest behaviour.

**Backfill**

- **FR-019**: System MUST provide a one-time, idempotent operation that applies the
  "update product info" refresh across all existing products and is safe to re-run.

**Schema migration & deployment safety**

- **FR-020**: Schema changes MUST be strictly additive and non-destructive: applying
  them MUST preserve all existing product and price-history data, with existing rows
  simply receiving empty values for the new fields. No existing column or row may be
  dropped, renamed destructively, or cleared.
- **FR-021**: The schema change MUST be delivered as a **versioned migration**: a
  reviewable migration artifact generated from the schema and committed to the
  repository (so the exact change is reviewed in the pull request), applied by a
  single migration command that records which migrations have run, so the same
  command produces the same result in every environment (local and production).
- **FR-022**: Applying migrations MUST be idempotent and re-run safe: a database that
  is already up to date is left unchanged, and only pending migrations are applied
  (tracked via a migration journal), causing no error and no data change.
- **FR-023**: On deployment, pending migrations MUST be applied **automatically
  before the application begins serving requests / consuming jobs**, and exactly one
  instance MUST be responsible for applying them — gated by a dedicated operational
  flag, consistent with the existing single-instance scheduler pattern. A manual
  apply path MUST remain available for local development and as a production fallback
  (runnable on a local terminal and via Coolify's container/database terminal).

### Key Entities *(include if feature involves data)*

- **Product (extended)**: the tracked item. Existing attributes (URL, name, image,
  active flag, last success/failure timestamps) gain an optional **description**
  (full text, no hard length limit), **category**, **brand/manufacturer**, **country
  of origin**, a flexible **attributes** set of key/value specifications (at most 100,
  stored as a single JSONB column on the `products` table), and an
  **info-last-updated** timestamp.
- **Price record (unchanged)**: a timestamped price (with currency) for a product;
  both "check price" and "update product info" append one.
- **Product info refresh (new operation/concept)**: a request to extract full
  metadata and price for one product; fans out per product in the batch case.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `packages/db` (extend the products data model),
  `apps/worker` (extend extraction output, add the metadata-refresh operation/job),
  `apps/web` (new per-product action, product detail dialog, revised digest dialog,
  supporting API route, digest trigger payload), `scripts/` (backfill), and
  `specs/`.
- **Data and Contracts Impact**: new optional product fields plus a flexible
  attributes store (a single additive JSONB column on the `products` table, capped at
  100 key/value pairs) and an info-last-updated timestamp; extraction output gains the
  new optional fields; a new background job type for metadata refresh on the existing
  queue; a new per-product "update info" API route mirroring the existing check-price
  route; the digest trigger payload gains a refresh "mode" (price-only vs
  info+price). The existing check-price and price-only digest contracts remain
  unchanged.
- **Operational Impact**: the metadata refresh uses the expensive AI extraction tier,
  so it is run only on add, on demand, or via explicit batch — never on the routine
  price-check loop, which keeps its cost/latency profile. The batch "info + price"
  mode is expensive (AI tier per product) and should be understood as such. Reuse the
  existing queue; no new always-on scheduling. The new columns are introduced by an
  **additive, versioned migration** (a reviewed migration file committed to the repo)
  that is **applied automatically on deploy, before the application starts serving /
  consuming**, by a single gated instance. This adds one new operational flag (e.g.
  `RUN_MIGRATIONS`) that designates which single instance runs migrations, mirroring
  the existing single-`ENABLE_SCHEDULER` pattern; a manual apply command remains for
  local development and as a production fallback. Because the changes are additive and
  the new code tolerates not-yet-enriched rows, no manual pre-deploy step is required.
  Effective deployment order: deploy → gated instance auto-applies pending migrations →
  application serves → (optionally) run the metadata backfill.
- **Verification Notes**: automated coverage for the extended extraction output
  (new optional fields), the new metadata-refresh operation/job (including
  best-effort partial and total-failure behaviour), the new API route, the digest
  trigger mode handling, and UI components (per-product menu item, detail dialog
  open/close vs actions menu, revised digest dialog). Backfill idempotency verified
  by a re-run. Manual validation: open detail dialogs from the Products page and
  dashboard, and run both digest modes end to end.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a representative sample of product pages that list them, the
  "update product info" operation captures a description and at least one of
  category/brand/country for at least 80% of those products.
- **SC-002**: The routine price-check operation shows no measurable latency or cost
  regression compared with before this feature (metadata extraction never runs on it).
- **SC-003**: 100% of products successfully processed by "update product info" (or
  added new) have an "info last updated" timestamp set.
- **SC-004**: From any product list (Products page or dashboard), a user can open the
  detail dialog and see the captured metadata in a single click, with missing fields
  shown gracefully and the actions menu still independently operable.
- **SC-005**: Running the backfill once enriches every existing product that has
  available page metadata, and running it a second time completes with no errors and
  no duplicate side effects.
- **SC-006**: The "Check All & Send Email" dialog no longer shows any non-functional
  control, and both refresh modes (price-only default, info + price) produce the
  expected refresh before the digest is sent.
- **SC-007**: Applying the schema migration preserves 100% of existing products and
  price-history records (zero data loss). On deploy, pending migrations are applied
  automatically by a single gated instance before the application serves traffic, a
  deploy with no pending migrations is a no-op, and a manual apply path remains
  available for local development and as a production fallback.

## Assumptions

- **On-add enrichment**: adding a new product triggers the full "update product info"
  operation once (per the idea spec's "once on add, then on demand only"), replacing
  a plain price-only first check, so products start enriched.
- **Best-effort extraction**: partial results are acceptable and expected. A
  successfully processed page overwrites the full metadata set (storing what is found
  and blanking fields the page no longer provides); only a total page/extraction
  failure leaves metadata untouched and records a failure.
- **Bounded attributes**: the flexible specification set is limited to at most 100 of
  the most important/relevant key/value pairs per product (stored as a single JSONB
  column on the `products` table) to avoid storage/UI bloat; if the page exposes more,
  the extractor returns only the top 100.
- **No auth on new routes**: consistent with the rest of the app, the new route(s)
  are unauthenticated for now (deferred app-wide).
- **Reuse existing infrastructure**: the new operation reuses the existing extraction
  plumbing, queue, provider selection, and dialog/action UI patterns; only the field
  set, persistence, and triggers differ.
- **Versioned, auto-applied migrations**: the additive schema change ships as a
  reviewed, committed migration file and is applied automatically on deploy by a
  single gated instance (mirroring the existing single-`ENABLE_SCHEDULER` pattern),
  tracked via a migration journal so re-runs are no-ops. A manual apply command is
  kept for local development and as a production fallback. The new code tolerates
  not-yet-enriched rows (empty new fields), so there is no hard ordering failure if a
  product is read before it is enriched.
- **Out of scope**: embeddings / semantic search (a later phase consumes this
  feature's richer metadata but is not built here).
