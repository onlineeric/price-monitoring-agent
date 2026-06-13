# Quickstart: Extend Product Info Extraction

How to apply, run, and verify this feature in **local development** and
**production** — with emphasis on a zero-issue schema migration on both.

## Prerequisites

- `pnpm docker:up` (PostgreSQL + Redis running)
- Root `.env` populated (DB/Redis URLs, `AI_PROVIDER` + provider key/model)

## New / changed environment variable

| Var | Where | Value | Purpose |
|---|---|---|---|
| `RUN_MIGRATIONS` | the **single** gated worker (the one with `ENABLE_SCHEDULER=true`) | `true` | Auto-apply pending migrations on worker startup, before it consumes jobs. All other instances leave it unset/`false`. |

Add it to the worker service in `docker-compose.yml` (next to `ENABLE_SCHEDULER`)
and to the production worker app in Coolify. Document it in `.env`.

---

## Migration workflow (the part that must deploy cleanly)

This feature makes **versioned migrations** the canonical, shippable path. The
committed `packages/db/drizzle/` folder is the source of truth. The `drizzle-kit
push` script is **kept for quick local prototyping only** — never use it to
deliver a schema change; anything reaching `dev`/`main` goes through a reviewed,
journalled migration.

### One-time adoption (done during implementation, committed to the repo)

1. `pnpm --filter @price-monitor/db generate` on the **unchanged** schema →
   `0000_*.sql`. Edit its DDL to use `CREATE TABLE IF NOT EXISTS …` (and
   `IF NOT EXISTS` on any index/constraint) so it is a **no-op on existing
   databases**.
2. Add the new columns to `packages/db/src/schema.ts`.
3. `pnpm --filter @price-monitor/db generate` → `0001_*.sql`. Confirm it only
   `ALTER TABLE products ADD COLUMN …`; tighten to `ADD COLUMN IF NOT EXISTS`.
4. Commit `drizzle/` (SQL + `meta/_journal.json` + snapshots).

### Apply locally (existing developer DB — created via `push`)

```bash
pnpm --filter @price-monitor/db migrate
```

- `0000` is a no-op (tables already exist, `IF NOT EXISTS`).
- `0001` adds the six new columns. Existing products + full price history are
  preserved; new columns are `NULL`.
- Re-running is a no-op (journal already records both migrations) — verify by
  running it twice.

### Apply on a fresh database (CI / new contributor / new prod volume)

```bash
pnpm docker:up
pnpm --filter @price-monitor/db migrate
```

`0000` creates the full schema, `0001` adds the new columns. (pgvector stays
handled separately by `scripts/db-init/` on fresh volumes — unrelated to this
feature.)

### Apply on production deploy

- The gated worker (`RUN_MIGRATIONS=true`) runs the migrator on startup **before**
  it begins consuming jobs. A deploy with nothing pending is a true no-op.
- Manual fallback (Coolify container/database terminal):
  `pnpm --filter @price-monitor/db migrate`.
- Because the change is additive + nullable and the `ALTER` is metadata-only
  (no table rewrite), the apply is sub-second and existing rows simply gain empty
  columns (SC-007).

---

## Run & verify by user story

### US1 — Enrich on demand / on add (P1)

```bash
pnpm worker:dev            # local worker (auto-manages Docker worker)
pnpm --filter @price-monitor/web dev
```

- Add a product → confirm an `update-product-info` job runs and the row gains
  description/category/brand/country/attributes + `info_updated_at` + a price.
- On an existing product, actions menu → **Update product info**: metadata +
  `info_updated_at` refresh and a new price record appears.
- **Check price now**: only a new price record; metadata and `info_updated_at`
  unchanged.
- Partial page (some fields): found fields stored, missing fields blanked, no
  failure. Unreachable page: failure recorded, metadata untouched.

### US2 — Detail dialog (P2)

- Click a product card and a table row → detail dialog opens with image, name,
  source link, current price + currency, trend, metadata, attributes list, and
  **both** "info last updated" + "price last checked" timestamps.
- Open the actions menu → dialog does **not** open; Check price / Update info /
  Edit / Delete still work.
- A product missing metadata renders placeholders/hidden sections, not broken UI.

### US3 — Batch refresh mode (P3)

- "Check All & Send Email" dialog: the "Force AI Extraction" toggle and
  "(under construction)" caption are gone; a two-option choice defaults to
  "Refresh all products' price".
- Select "Refresh all products info (info + price)" → every active product gets
  full metadata + price before the digest sends. Default keeps price-only.

### US4 — Backfill (P3)

```bash
# Lives in the worker workspace (testable + alongside the queue infra,
# mirroring scripts/cleanupDigestSchedules.ts)
pnpm --filter @price-monitor/worker backfill:product-info
```

- Pre-feature products gain metadata + `info_updated_at`. Re-run → completes with
  no errors and just refreshes (idempotent).

---

## Tests & lint (pre-PR gate)

```bash
pnpm test     # db + worker + web (+ mcp-server, reporting)
pnpm lint
```

Expected new/updated coverage:
- `packages/db`: new columns/types; `attributes` schema cap at 100.
- `apps/worker`: `aiExtractProductInfo` (mocked AI), `update-product-info` job
  (success-overwrite / partial / total-failure), digest `mode` child selection.
- `apps/web`: update-info route, digest-trigger mode, `manual-trigger-button`
  (two-option, no construction label), detail dialog (open on card/row, not on
  menu, graceful missing fields), menu item present.
- Backfill idempotency (mocked queue).
