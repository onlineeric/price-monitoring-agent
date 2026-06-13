# Database migrations

The schema is delivered as **versioned, committed Drizzle migrations** — the
canonical, reviewable, shippable path. The committed `packages/db/drizzle/`
folder (SQL files + `meta/_journal.json`) is the source of truth.

> `drizzle-kit push` is **kept only for quick local prototyping**. Never use it
> to deliver a schema change — anything that reaches `dev`/`main` goes through a
> reviewed, journalled migration.

## Authoring a schema change

```bash
# 1. Edit packages/db/src/schema.ts
# 2. Generate the migration SQL + snapshot from the schema diff
pnpm --filter @price-monitor/db generate
# 3. Review the generated drizzle/NNNN_*.sql, then commit drizzle/ in full
```

The first-ever baseline (`0000_*.sql`) was hand-edited so every `CREATE TABLE`
uses `IF NOT EXISTS` and the foreign key is wrapped in a
`DO $$ … EXCEPTION WHEN duplicate_object` block. That makes the baseline a
**no-op on databases that already exist** (local + prod were originally created
with `push`) and a full create on fresh ones (CI, a new contributor, a new prod
volume). Additive column migrations use `ADD COLUMN IF NOT EXISTS`, so they are
idempotent and safe to re-run.

## Applying migrations

```bash
pnpm --filter @price-monitor/db migrate
```

This runs `packages/db/src/migrate.ts` (the Drizzle `postgres-js` migrator
pointed at `./drizzle`). It records each applied migration in the
`drizzle.__drizzle_migrations` journal table, so a database that is already up
to date is left untouched — running it again is a true no-op. The standalone
command loads the monorepo root `.env` for `DATABASE_URL`.

## Auto-apply on deploy: `RUN_MIGRATIONS`

| Var | Where | Value |
|---|---|---|
| `RUN_MIGRATIONS` | the **single** gated worker (the one with `ENABLE_SCHEDULER=true`) | `true` |

On startup, that one worker runs pending migrations **before** it begins
consuming jobs (the BullMQ `Worker` is created with `autorun: false` and
`worker.run()` is called only after migrations succeed). A migration failure is
fatal — the worker logs the error and exits non-zero rather than serve against a
stale schema. Every other instance leaves `RUN_MIGRATIONS` unset/`false`.

This mirrors the existing single-instance `ENABLE_SCHEDULER` pattern, so the
same gated worker owns both. Because the additive change is metadata-only
(`ALTER TABLE … ADD COLUMN`, no table rewrite, nullable columns), the apply is
sub-second and existing rows simply gain empty columns — no data loss.

**Manual fallback** (e.g. from the Coolify container/database terminal, or if a
deploy ever needs migrations applied ahead of the web rollout):

```bash
pnpm --filter @price-monitor/db migrate
```

## Fresh database

```bash
pnpm docker:up
pnpm --filter @price-monitor/db migrate   # 0000 creates the schema, then later migrations apply
```

(pgvector is handled separately by `scripts/db-init/` on fresh volumes.)
