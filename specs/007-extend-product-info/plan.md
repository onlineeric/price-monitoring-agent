# Implementation Plan: Extend Product Info Extraction (Rich Metadata)

**Branch**: `007-extend-product-info` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-extend-product-info/spec.md`

## Summary

Capture and store **rich product metadata** (description, category, brand,
country of origin, and up to 100 key/value spec attributes) alongside the price,
and surface it in the UI — while keeping the cheap, frequent price check
unchanged. The work decouples slow-changing metadata from fast-changing price by
introducing a **second refresh operation** ("update product info") that runs the
expensive AI tier and is triggered only on add, on demand, or via an explicit
batch; the existing "check price" path keeps its cost/latency profile.

Technical approach:

- **`packages/db`** — additive schema change on `products`: `description`,
  `category`, `brand`, `country_of_origin` (text), `attributes` (JSONB,
  `{key,value}[]` capped at 100), and `info_updated_at` (timestamp). Adopt
  **versioned Drizzle migrations** (`generate` → committed SQL + journal →
  `migrate`) replacing the ad-hoc `push` workflow, with `IF NOT EXISTS` guards so
  the migration is safe to adopt on already-populated local and production
  databases.
- **`apps/worker`** — extend AI extraction to optionally return the new fields;
  add a `scrapeProductInfo` path (Playwright render + AI) and an
  `update-product-info` job that writes a price record **and** overwrites the
  metadata set (best-effort, blanks missing fields, sets `info_updated_at`).
  Auto-apply migrations on startup, gated by a new `RUN_MIGRATIONS` flag on the
  single instance that already owns `ENABLE_SCHEDULER`.
- **`apps/web`** — new `POST /api/products/[id]/update-info` route, a reusable
  product **detail dialog**, an "Update product info" menu item in card + table
  views, and a two-option refresh mode (price-only vs info+price) in the
  "Check All & Send Email" dialog wired through the digest trigger payload.
- **`scripts/`** — idempotent backfill that enqueues `update-product-info` for
  all existing products.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js (ESM)
**Primary Dependencies**: Next.js 16 / React 19, Drizzle ORM 0.45 + drizzle-kit
0.31 (postgres-js driver), BullMQ, Playwright 1.57 + stealth, Vercel AI SDK
(OpenAI / Anthropic / Google), Zod, Shadcn UI / Tailwind v4, date-fns, cheerio
**Storage**: PostgreSQL 18 (Drizzle), Redis 8 (BullMQ). New JSONB column on
`products`; prices remain integer cents in `price_records`.
**Testing**: Vitest per workspace (colocated `*.test.ts(x)`); chainable-Drizzle
and queue mocks at the module boundary (no live Postgres/Redis in tests).
**Target Platform**: Linux server — Docker Compose locally; Coolify on a
$24/mo 2vCPU/4GB DigitalOcean droplet (web, worker, mcp-server as 3 apps).
**Project Type**: Web application (monorepo: `apps/web`, `apps/worker`,
`apps/mcp-server`, `packages/db`, `packages/reporting`).
**Performance Goals**: Price check unchanged (~100-500ms Tier 1 / ~3-6s Tier 2).
Metadata refresh uses the AI tier (~3-6s/product) and never runs on the routine
price loop (SC-002). Batch "info+price" is understood to be AI-cost per product.
**Constraints**: Additive, non-destructive migration with zero data loss
(SC-007); attributes capped at 100/product; RAM headroom is tight on the prod
droplet (no new always-on process — reuse the existing queue/worker).
**Scale/Scope**: Small catalogue (tens–low hundreds of products); single worker
in prod with `ENABLE_SCHEDULER=true` (now also `RUN_MIGRATIONS=true`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit** — PASS. All work stays inside existing boundaries
  (`packages/db`, `apps/worker`, `apps/web`, `scripts/`, `specs/`). No new app,
  package, or runtime; the metadata refresh reuses the existing BullMQ queue and
  extraction plumbing. No new always-on scheduler.
- **Typed Maintainability** — PASS. New fields are explicit Drizzle columns with
  inferred types; the attributes shape is a shared, Zod-validated
  `ProductAttribute[]` type exported from `packages/db`. AI extraction uses
  `generateObject` with a Zod schema (no ad-hoc parsing); HTML handling keeps
  using cheerio/Playwright. New UI reuses Shadcn dialog/dropdown patterns.
- **Data Safety** — PASS. All persistence uses the Drizzle query builder; the
  only raw SQL is inside the generated/committed migration files (the sanctioned
  mechanism for DDL) and `IF NOT EXISTS` guards. Prices stay integer cents; URL
  stays the product identity. Schema change is strictly additive — existing rows,
  columns, and price history are preserved; new columns are nullable.
- **Verification Plan** — PASS. Per-story automated coverage defined below
  (extraction output, the new job's success/partial/total-failure behaviour, the
  new API route, digest mode handling, UI open/close vs actions menu, backfill
  idempotency). Manual validation: open detail dialogs from Products + dashboard,
  run both digest modes, apply the migration on a populated DB.
- **Operational Readiness** — PASS. One new env flag (`RUN_MIGRATIONS`) mirrors
  the single-`ENABLE_SCHEDULER` pattern and is documented in quickstart +
  docker-compose + `.env`. Migrations apply automatically on deploy before the
  worker consumes jobs, with a manual apply path (`pnpm --filter
  @price-monitor/db migrate`) for local dev and as a production fallback.
  Structured logging on the migrate step and the new job. Rollback: the change is
  additive, so rolling back code leaves the extra columns harmless.

**Result**: PASS — no violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/007-extend-product-info/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api-update-info.md
│   ├── api-digest-trigger.md
│   ├── job-update-product-info.md
│   └── extraction-output.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/db/
├── src/
│   ├── schema.ts                 # + description/category/brand/country/attributes/info_updated_at
│   ├── schema.test.ts            # + assertions for new columns/types
│   ├── attributes.ts             # NEW: ProductAttribute type + Zod schema (max 100)
│   ├── migrate.ts                # NEW: programmatic migrator (drizzle-orm migrator)
│   └── index.ts                  # + export ProductAttribute / attributes schema
├── drizzle/                      # NEW: committed migration SQL + meta/_journal.json
│   ├── 0000_*.sql                # baseline (current schema, IF NOT EXISTS guarded)
│   └── 0001_*.sql                # additive new columns
└── package.json                  # + "migrate" script

apps/worker/src/
├── types/scraper.ts              # + ProductInfo fields on a richer result type
├── services/
│   ├── aiExtractor.ts            # + aiExtractProductInfo (extended Zod schema + prompt)
│   ├── playwrightFetcher.ts      # expose rendered-HTML path for metadata reuse
│   ├── scraper.ts                # + scrapeProductInfo (Playwright + AI, full metadata)
│   ├── database.ts               # + saveProductInfo (overwrite metadata + info_updated_at)
│   └── update-prices.ts          # + mode param: "price" | "info" child job selection
├── jobs/
│   ├── updateProductInfo.ts      # NEW job processor (+ .test.ts)
│   └── sendDigest.ts             # pass refresh mode through to the flow
├── queue/worker.ts               # + "update-product-info" case
└── index.ts                      # + gated migrate-on-startup (RUN_MIGRATIONS)

apps/web/src/
├── app/api/
│   ├── products/[id]/update-info/route.ts   # NEW (mirrors check-price)
│   ├── products/route.ts                     # on-add: enqueue update-product-info
│   └── digest/trigger/route.ts               # accept { mode } in body
└── app/(main)/dashboard/
    ├── _components/manual-trigger-button.tsx          # two-option mode, drop fake toggle
    └── products/_components/
        ├── product-detail-dialog.tsx          # NEW reusable detail dialog (+ test)
        ├── use-update-info.ts                  # NEW hook (mirrors use-check-price)
        ├── products-view.tsx                   # extend ProductWithStats with metadata
        ├── product-card-view.tsx               # menu item + open dialog on card click
        └── product-table-view.tsx              # menu item + open dialog on row click

scripts/
└── backfill-product-info.ts      # NEW idempotent backfill (enqueues update-product-info)
```

**Structure Decision**: Web-application monorepo (existing). Each concern lands
in its established boundary; the only structural additions are the committed
`packages/db/drizzle/` migration folder and `packages/db/src/migrate.ts`, which
formalise the migration workflow the spec mandates.

## Complexity Tracking

> No constitution violations — section intentionally empty.
