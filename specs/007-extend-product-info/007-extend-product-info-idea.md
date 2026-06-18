# Idea Spec 007 — Extend Product Info Extraction (Rich Metadata for RAG)

> **Status:** Idea / seed spec. This document captures the intent, rationale, and
> detailed scope for a new feature. It is the **input** to a full Speckit SDD
> workflow (`/speckit.specify` → `/speckit.plan` → `/speckit.tasks` →
> `/speckit.implement`). It is not the formal `spec.md`.

---

## 1. Background — how this idea came up

While planning **Phase 4 (Semantic Search with pgvector / RAG)** of the AI Agent
roadmap (`docs/AI-agent-mcp-server-idea.md`), we reached task **4.2 — design the
embedding pipeline**. A blocking realization surfaced:

- Our `products` table stores almost no text — effectively just `name` (nullable),
  plus `url` and `imageUrl`. (Schema: `packages/db/src/schema.ts`.)
- Our extractor (`apps/worker/src/services/aiExtractor.ts` +
  `htmlFetcher.ts` + `playwrightFetcher.ts`) only pulls **title, price, currency,
  imageUrl**.
- **RAG quality is capped by the text we embed.** With only a product name, a
  semantic search like *"find me a cheap gaming monitor"* degrades into fuzzy
  keyword matching on the title — it cannot demonstrate the "understands meaning,
  not keywords" value that makes vector search worth showing in a portfolio /
  interview. Garbage in → garbage vectors.

**Conclusion:** before building the embedding pipeline (4.2+), we must first
enrich the product data we extract and store. This feature does exactly that.

This is a **prerequisite for Phase 4** and should be completed before 4.2.

---

## 2. Why we need this

1. **RAG demo quality** — rich text (description, category, brand, specs) is what
   makes vector search visibly better than `ILIKE`. It directly determines how
   good the Phase 4 semantic search demo is.
2. **Better UI today** — even before RAG, showing description / brand / category /
   country on the product detail and cards makes the app feel like a real product
   tracker, not a price-only scraper.
3. **Portfolio narrative** — demonstrates thoughtful data modeling and a clean
   separation between slow-changing metadata and fast-changing price.

---

## 3. Core architectural decision — decouple *metadata* from *price*

This is the most important design principle for this feature.

- **Price** is **dynamic** — it changes often, so we check it cheaply and
  frequently via the existing fast 2-tier pipeline (Tier 1 HTML+Cheerio ~100ms,
  Tier 2 Playwright+AI only as fallback). **This loop stays exactly as-is.**
- **Metadata** (description, category, brand, country, specs) is **static** — it
  basically never changes after a product is listed. Re-extracting it on every
  daily price check would force the expensive AI tier to run constantly (slow +
  token cost) for no benefit.

**Therefore we split the two operations:**

| Operation | What it refreshes | Cost | Frequency |
|---|---|---|---|
| **Check price** (existing) | price (+ currency) only | cheap, fast 2-tier | daily / on demand |
| **Update product info** (new) | full metadata **+ price** (uses AI tier) | expensive | once on add, then on demand only |

Interview soundbite: *"I separated slow-changing metadata from fast-changing
price so I only pay for AI extraction when it actually adds value."*

---

## 4. Detailed scope (what needs to be done)

### 4.1 Database schema (`packages/db/src/schema.ts`)

Extend the `products` table with **hybrid storage**:

- **Structured columns** for fields we may filter / group by:
  - `category` (text, nullable)
  - `brand` / `manufacturer` (text, nullable)
  - `countryOfOrigin` (text, nullable)
- **Free text:**
  - `description` (text, nullable) — short product description / summary
- **Flexible long-tail specs:**
  - `attributes` (`jsonb`, nullable) — arbitrary key/value specs that vary by
    product (e.g. screen size, capacity, color, weight, model number).
- **Bookkeeping:**
  - `infoUpdatedAt` (timestamptz, nullable) — when metadata was last extracted,
    so we can tell "price-only checked" rows from "fully enriched" rows and decide
    backfill candidates.

Rationale for hybrid: real columns are queryable/filterable (category, brand,
country); `jsonb` absorbs the varied per-product specs without schema churn;
`description` is the main text RAG will embed. Pure-JSON would not be filterable;
all-columns would be rigid for varied specs.

Drizzle migration generated via `pnpm --filter @price-monitor/db generate`.

### 4.2 AI extractor (`apps/worker/src/services/aiExtractor.ts`)

- Extend `ProductDataSchema` (Zod) with the new fields, **all nullable** — pages
  vary, the model returns only what it finds.
- Expand `getExtractionPrompt()` to ask for description, category, brand,
  countryOfOrigin, and a small set of key spec attributes.
- The AI tier already sends up to 150K chars of cleaned page content, so the
  source text is already in context — we are only asking for more fields.
- Keep the existing title/price/currency/imageUrl behavior intact.

### 4.3 Two distinct refresh operations (worker + API + jobs)

Create **separate methods / code paths** so the two operations are independent:

1. **Refresh price** (existing) — `check-price` job → fast 2-tier → writes a new
   `priceRecords` row. Unchanged.
2. **Refresh product info** (new) — a new operation that runs the **AI tier** to
   extract full metadata, updates the `products` row metadata columns +
   `attributes` + `infoUpdatedAt`, **and** records price (so "update info" implies
   a price check too). Likely a new BullMQ job type (e.g. `update-product-info`)
   processed by the worker, plus a new API route
   (e.g. `POST /api/products/[id]/update-info`).

Design notes to resolve during planning:
- New BullMQ job name + queue wiring (reuse `price-monitor-queue`).
- New API route(s) mirroring the existing `check-price` route shape.
- Reuse existing extractor plumbing; only the field set + persistence differ.

### 4.4 Backfill existing products

- One-time script (e.g. `scripts/backfill-product-info.ts`) that runs the
  "update product info" operation over all existing products to populate the new
  fields. Mirrors the embeddings backfill that Phase 4 will add later.
- Idempotent; safe to re-run.

### 4.5 UI changes

**(a) Per-product menu — add "Update product info"**
In both product views, the row/card actions dropdown currently has a
**"Check price now"** item:
- `apps/web/src/app/(main)/dashboard/products/_components/product-card-view.tsx`
- `apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx`
- shared hook: `apps/web/src/app/(main)/dashboard/products/_components/use-check-price.ts`

Add a new menu item **"Update product info"** directly under "Check price now".
It triggers the new refresh-info operation (metadata + price). Mirror the loading
/ disabled / toast pattern of the existing "Check price now" action (consider a
parallel `use-update-info.ts` hook).

**(b) Dashboard "Check All & Send Email" dialog — replace the fake toggle**
File: `apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.tsx`.
Currently the confirm dialog shows a **disabled** "Force AI Extraction" `Switch`
with a *"(Feature under construction)"* label (lines ~89–96). This is dead UI.

- **Remove** the disabled "Force AI Extraction" switch and its
  "(Feature under construction)" label.
- **Replace** with a **radio group** offering two modes:
  1. **"Refresh all products' price"** — runs the existing price-only digest
     (current behavior; default selection).
  2. **"Refresh all products info (Product info + price)"** — runs the full
     metadata refresh for every product, then sends the email digest.
- The selected mode is passed to the digest trigger so the worker runs the
  corresponding operation for the batch.

**(c) New Product Detail dialog (Products page + dashboard)**
With richer metadata captured, add a **Product Detail dialog** that pops up when a
user **clicks a product** (the card / row itself, not the actions menu).

- **Where:** the Products page (both card view + table view) and the dashboard
  product widgets (`apps/web/src/app/(main)/dashboard/default/` overview, wherever
  products are listed).
- **Trigger:** clicking the product card / table row opens the dialog. The
  existing actions dropdown ("Check price now", "Update product info", "Edit",
  "Delete") must keep working — stop click propagation on the dropdown trigger so
  opening the menu does not also open the detail dialog.
- **Content:** show the captured product info — image, name, URL (link), current
  price + currency, price trend / mini chart, and the **new metadata**:
  `description`, `category`, `brand`/`manufacturer`, `countryOfOrigin`, and the
  `attributes` (jsonb) rendered as a key/value list. Gracefully handle missing
  fields (show "—" / hide empty sections), and show `infoUpdatedAt` ("info last
  updated…") vs `lastChecked` (price) so the two refresh operations are visible.
- **Reuse:** follow the existing dialog pattern in
  `product-card-view.tsx` / `product-table-view.tsx`
  (`EditProductDialog`, `DeleteProductDialog` opened via local state). Create a
  shared `product-detail-dialog.tsx` so both Products page and dashboard reuse it.
- **Nice-to-have:** surface the per-product actions ("Check price now", "Update
  product info") inside the dialog too, for convenience.

### 4.6 API / worker wiring summary

- New job type for metadata refresh; digest trigger accepts a "mode"
  (price-only vs full-info) and fans out the appropriate job per product.
- New per-product "update info" API route.
- Existing `check-price` and digest price-only paths remain the default and
  unchanged in behavior.

---

## 5. Locked decisions (answers already given)

- **Fields:** `description`, `category`, `brand`/`manufacturer`, `countryOfOrigin`,
  plus a flexible `attributes` (jsonb) for long-tail specs. (Accepted suggestion.)
- **Storage:** hybrid — structured columns for filterable fields + `description`
  text + `jsonb attributes`. (Accepted suggestion.)
- **Backfill + refresh:** separate operations. "Check price" refreshes price only;
  "Update product info" refreshes metadata **+** price. Expose both in the UI
  (per-product menu item + dashboard batch radio). One-time backfill script.
  (Accepted suggestion + user enhancement.)
- **UI enhancement:** remove the fake "Force AI Extraction" toggle on the
  "Check All & Send Email" dialog; replace with a two-option radio group
  (price-only vs info+price). (User-requested.)
- **Product Detail dialog:** clicking a product (Products page card/table + the
  dashboard product widgets) opens a shared detail dialog showing the captured
  metadata (description, category, brand, country, attributes) alongside image /
  price / trend, while preserving the existing actions dropdown. (User-requested.)

---

## 6. Out of scope (handled later)

- **Embeddings / pgvector / semantic search** — that is Phase 4 (4.2+), which
  *consumes* the richer metadata this feature produces. Once this ships, the
  Phase 4 "what text to embed" decision becomes
  `name + description + category + brand` instead of name-only.
- Authentication on the new routes (deferred app-wide, consistent with existing
  routes).

---

## 7. Suggested follow-up

After this feature merges, update `docs/AI-agent-mcp-server-idea.md` Phase 4 notes
so 4.2's "what text to embed" reflects the new fields, and proceed with the Phase 4
embedding pipeline.
