# CLAUDE.md / AGENTS.md

Agent instructions for this repository. `CLAUDE.md` and `AGENTS.md` are hard links to one file — Claude Code reads `CLAUDE.md`, other agents read `AGENTS.md`. `AGENTS.md` is gitignored; after cloning run `ln CLAUDE.md AGENTS.md` (bash) or the `New-Item -ItemType HardLink` equivalent (PowerShell).

## Project Overview

AI-powered price monitoring system: tracks product prices from URLs, stores price history, and sends automated email digests with trend analysis.

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend + API | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Shadcn UI |
| Data Fetching/State | TanStack Query, TanStack Table, React Hook Form, Zustand |
| Background Worker | Node.js, BullMQ (Redis queue), tsx watch |
| Browser Automation | Playwright + puppeteer-extra-plugin-stealth |
| AI Integration | Vercel AI SDK (OpenAI / Anthropic / Google via `AI_PROVIDER`) |
| Database | PostgreSQL 18 + pgvector + Drizzle ORM, Redis 8 |
| Email | Resend + React Email |
| Infrastructure | Docker Compose (local), Coolify on DigitalOcean (prod), GitHub Actions CI/CD |

## Core Rules

**Database access:** Always use the Drizzle query builder (`db.select()`, `db.insert()`, `db.query.*`). No raw SQL via `db.execute()` unless unavoidable; use the `sql` template tag only for inline expressions (e.g. `COALESCE`). The chat agent gets typed MCP tools, never SQL.

**Migrations (since 007):** Schema changes ship as versioned, committed migrations — not `drizzle-kit push`. Edit `packages/db/src/schema.ts` → `pnpm --filter @price-monitor/db generate` (commit the SQL under `packages/db/drizzle/`) → `… migrate` to apply. In prod a **single** gated worker auto-applies pending migrations on startup when `RUN_MIGRATIONS=true`, before consuming jobs. Keep migrations **additive** so a rolling deploy's old code keeps working. `push` is for throwaway local experiments only.

**Environment:** One `.env` at the monorepo root. Each runnable component loads it directly at startup via `dotenv.config()` (web: `next.config.mjs`; worker: `src/config.ts`; mcp-server: top of `src/index.ts`, `quiet: true` so logs never hit stdio stdout; drizzle-kit CLI: `drizzle.config.ts`). The `packages/db` runtime does not load env — it expects `DATABASE_URL` already in `process.env`. In prod (Coolify) there is no `.env`; container env vars win.

## Repository Structure

```
apps/
  web/         # Next.js — dashboard UI, chat page, REST + /api/chat streaming API
  worker/      # BullMQ consumer — extraction, DB writes, email
  mcp-server/  # MCP server — typed tools for the chat agent (stdio for IDE, HTTP app-to-app)
packages/
  db/          # Drizzle schema + client + versioned migrations (@price-monitor/db)
  reporting/   # Shared email rendering/sending (React Email digest) — used by web + worker
specs/         # Per-feature spec.md / plan.md / tasks.md
docs/          # Production environment reference
scripts/       # Utility scripts
```

## Essential Commands

```bash
# Dev
pnpm docker:up                            # Start PostgreSQL + Redis (worker/mcp are opt-in profiles)
pnpm --filter @price-monitor/web dev      # Next.js dev server (port 3000)
pnpm worker:dev                           # Local dev worker (swaps out the Docker worker, tsx watch)
pnpm mcp:dev                              # Local dev MCP server (swaps out the Docker mcp-server)
pnpm lint                                 # Biome check (CI-equivalent gate)
pnpm lint:fix                             # Biome safe + unsafe autofixes — review the diff

# Tests (Vitest per workspace; add --filter <pkg> to scope, e.g. @price-monitor/web)
pnpm test

# Database (see Migrations rule)
pnpm --filter @price-monitor/db generate  # New migration from schema.ts changes
pnpm --filter @price-monitor/db migrate   # Apply pending migrations
pnpm --filter @price-monitor/db studio    # Drizzle Studio

# Docker worker / mcp-server lifecycle
pnpm worker:up | worker:down | worker:logs | worker:restart
pnpm mcp:up | mcp:down | mcp:logs

# One-off backfills (enqueue a job per product). Run product-info BEFORE embeddings.
pnpm --filter @price-monitor/worker backfill:product-info
pnpm --filter @price-monitor/worker backfill:embeddings
```

`worker:dev` / `mcp:dev` use a swap pattern (`scripts/dev-*.sh`): stop the Docker container, run a local tsx-watch process, restart the container on Ctrl+C. The Docker worker and mcp-server use opt-in compose profiles, so `pnpm docker:up` starts only Postgres + Redis.

## Architecture

### Data Model

- **products** — URL (unique key), name, imageUrl, active, lastSuccessAt/lastFailedAt, plus 007 metadata: `description`, `category`, `brand`, `countryOfOrigin`, `attributes` (JSONB ordered key/value specs, capped 100 — `packages/db/src/attributes.ts`), `infoUpdatedAt`.
- **priceRecords** — productId (FK cascade), price (**integer cents**), currency, scrapedAt.
- **productEmbeddings** (008) — one row per (product, chunk): chunkIndex, content, `embedding vector(384)`, HNSW cosine index. Rebuilt only by reindex.
- **settings** — key/value JSON (email schedule, etc.). **runLogs** — job status/errors (no productId FK).

Products auto-create on first URL check. Metadata (slow-changing) is decoupled from price (fast-changing): a price check never touches metadata; only `update-product-info` (re)extracts it, **overwriting** the full set (fields not found this run are blanked).

### Extraction Pipeline (2-tier)

1. **Tier 1 — HTML fetch + Cheerio** (~100-500ms): CSS-selector price extraction only.
2. **Tier 2 — Playwright + AI** (~3-6s): stealth headless Chromium, selectors first then AI fallback (Zod-validated); singleton browser reused across jobs.

`FORCE_AI_EXTRACTION=true` skips Tier 1. Rich metadata extraction always uses the AI tier (`ProductInfoSchema`, OpenAI strict-mode compatible).

### Job Flow (BullMQ, queue `price-monitor-queue`)

Jobs (`apps/worker/src/queue/worker.ts`): `check-price`, `update-product-info`, `reindex-product-embeddings`, `send-digest` / `send-digest-scheduled` (same handler), `send-digest-flow` (FlowProducer parent).

- **check-price** — extract + save a price record; metadata untouched.
- **update-product-info** — extract metadata + a fresh price; overwrite metadata, write price, set `infoUpdatedAt`, then best-effort enqueue a reindex. Triggered on add (web `POST /api/products` **and** the MCP `add_product` tool — both enrich) and on demand (`products/[id]/update-info`, which waits ~45s for the job, else reports "still processing").
- **reindex-product-embeddings** (008) — `POST`s mcp-server's `/internal/reindex`; mcp-server rebuilds that product's embedding rows (delete-and-replace, atomic). Retryable (5 attempts, backoff) so an mcp-server blip self-heals; the worker holds no model.
- **digest** — refresh active products → trends → email. Payload `mode`: `"price"` (default, price-only) or `"info"` (full metadata+price); `digest/trigger` accepts `{ mode }`.
- **scheduled digest** — startup reads the schedule from DB, registers a repeatable job, re-polls DB every 5 min.

Prod: only ONE worker sets `ENABLE_SCHEDULER=true`. The worker starts `autorun: false` and calls `worker.run()` only after migrations apply (when `RUN_MIGRATIONS=true`).

### API Routes (`apps/web/src/app/api/`)

```
products/                  GET list, POST create
products/[id]/             GET, PATCH, DELETE
products/[id]/check-price  POST  price-only refresh
products/[id]/update-info  POST  full metadata+price refresh (waits ~45s)
chat/                      POST  streaming AI chat (Node runtime, MCP tools)
digest/trigger | status    POST { mode?: "price"|"info" } | GET
manual-report/preview|send POST  render preview | send ad-hoc email
settings/email-schedule    GET, POST
mcp/tools | mcp-server/health | worker/health | health   GET (list/health proxies)
```

### Web UI (`apps/web/src/app/(main)/dashboard/`)

`products/` (card + table views, edit dialog, global search, reusable **ProductDetailDialog** — image, source link, price + trend, key/value specs), `chat/` (streaming chat; replies that retrieved products render clickable product cards + inline `#product-<id>` links, both opening the reused ProductDetailDialog via `ChatProductDialogProvider` — 009), plus `default/`, `finance/`, `send-report/`, `settings/`. Shared helpers: `lib/products/product-stats.ts` (`getProductsWithStats` / `ProductWithStats`, used by the products page and `GET /api/products/[id]`) and `lib/chat/product-cards.ts` (single Zod card extractor).

### AI Chat Agent + MCP

- **Three-app topology** — in prod, `web`, `worker`, `mcp-server` are independent Coolify apps on one internal Docker network. Chat path: browser → `web` `/api/chat` → `mcp-server` (HTTP) → Postgres/Redis. mcp-server is internal-only (no public domain).
- **Transport split (`MCP_TRANSPORT`)** — `stdio` (default): spawned by the IDE for local dev (stdout = JSON-RPC frames, logs → stderr). `http`: Streamable HTTP on `MCP_HTTP_PORT` (3002), used by web→mcp-server in dev (Docker) and prod; stateless (fresh transport per request) so web and mcp-server scale independently.
- **mcp-server (`apps/mcp-server/`)** — Node + `@modelcontextprotocol/sdk`. Tools: `search_products`, `semantic_search_products` (008), `get_product_history`, `get_price_summary`, `add_product`, `ping`; errors normalized via `tools/_wrap.ts` to `{ error: { code, message } }`. HTTP also serves `GET /health`, `GET /mcp/health`, and `POST /internal/reindex` (internal-only, **not** an MCP tool). Test-only `slow_ping`/`throw_test` are gated on `NODE_ENV !== "production"`.
- **Single embedding authority (008)** — mcp-server loads a local `all-MiniLM-L6-v2` model once (`src/embeddings/`) for both `semantic_search_products` and reindex; weights are baked into the image (`scripts/warm-embedding-model.ts`), offline at runtime. Worker/backfill never embed — they enqueue/POST. Vector query is Drizzle-native (`vector(384)` + `cosineDistance` + HNSW). `EMBEDDING_PROVIDER=openai|google` is a seam, but switching is a deliberate dimension-change migration.
- **MCP client (`apps/web/src/lib/mcp/client.ts`)** — singleton; uses `StreamableHTTPClientTransport(MCP_HTTP_URL)` when set (prod + Docker dev), else stdio spawning the mcp-server (IDE fallback; override via `MCP_SERVER_COMMAND`/`MCP_SERVER_ARGS`).
- **Chat API (`api/chat/route.ts`)** — Vercel AI SDK `streamText` with MCP tools (`lib/ai/chat-tools.ts`). Enforces `CHAT_MAX_STEPS` (5) and `CHAT_TURN_TIMEOUT_MS` (60s). Errors use `ChatErrorCode` (`validation_error`, `provider_config_missing`, `mcp_unreachable`, `step_budget_exceeded`, `turn_timeout`, `empty_response`, `provider_error`). Provider via `AI_PROVIDER`; `CHAT_SYSTEM_PROMPT` keeps the agent on product/price topics.

## Lint & Tests

- **Lint** — Biome at the repo root (`biome.json`); `apps/web/biome.json` (`"root": false`) adds React/Next/Tailwind rules, auto-picked for web files. `pnpm lint` walks the whole monorepo. `lint:fix` applies unsafe fixes too — review the diff (it can drop write-only fields, rewrite `isNaN`→`Number.isNaN`).
- **Tests** — Vitest per workspace, colocated (`foo.ts` → `foo.test.ts`/`.test.tsx`); web also has `src/test/` for page/route tests (shared jsdom setup in `src/test/setup.ts`). No CI for tests — they're the local pre-commit gate. **When you change app code, add/update the colocated test and run `pnpm test` + `pnpm lint` before a PR.** Mock backends (Postgres/Redis/Resend) at the module boundary — see the chainable-Drizzle mock in `apps/worker/src/jobs/priceCheck.test.ts` and `apps/mcp-server/src/tools/*.test.ts`.

## Spec-Driven Development (Speckit)

Features live in `specs/<NNN>-<feature>/`: `spec.md` (intent — source of truth), `plan.md`, `tasks.md`. **Read `spec.md` first** when working a feature — specs hold context not visible in code or git log. Top-level `specs/*.md` mirror the most recent active feature.

## Git Workflow

Branches `feature/*` → `dev` → `main`. Merge to `main` → GitHub Actions → GHCR → Coolify auto-deploys. **Only create commits when explicitly requested.**

## Active Technologies
- TypeScript 5.9, Next.js 16 (App Router), React 19, Tailwind v4, Shadcn UI, TanStack Query/Table, Zustand, Drizzle ORM, PostgreSQL 18 + pgvector, Redis 8, BullMQ, Playwright, Vercel AI SDK (OpenAI/Anthropic/Google), `@modelcontextprotocol/sdk`, local `@huggingface/transformers` MiniLM + `@langchain/textsplitters`, Resend + React Email, `streamdown`.

## Recent Changes
- 009-chat-product-links: chat replies render clickable product cards (deduped, ≤5 + "+N more") and inline `#product-<id>` links, both opening the reused `ProductDetailDialog` via `ChatProductDialogProvider`. Web-only.
- 008-semantic-product-search: `semantic_search_products` MCP tool over pgvector; local MiniLM in mcp-server (single embedding authority); `product_embeddings` + HNSW; retryable `reindex-product-embeddings` job; `backfill:embeddings`.
- 007-extend-product-info: rich product metadata via `update-product-info` (AI tier, overwrites); reusable product detail dialog; versioned additive migrations auto-applied via `RUN_MIGRATIONS`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/009-chat-product-links/plan.md`
<!-- SPECKIT END -->
