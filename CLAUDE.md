# CLAUDE.md / AGENTS.md

Agent instructions for this repository. `CLAUDE.md` and `AGENTS.md` are hard links to the same file — [Claude Code](https://claude.ai/code) reads `CLAUDE.md`; other agents typically read `AGENTS.md`. `AGENTS.md` is gitignored; after cloning, run `ln CLAUDE.md AGENTS.md` (bash) or `New-Item -ItemType HardLink -Path AGENTS.md -Target CLAUDE.md` (PowerShell).

## Project Overview

AI-powered price monitoring system that tracks product prices from URLs, stores price history, and sends automated email digests with trend analysis.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend + API | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Shadcn UI |
| Data Fetching/State | TanStack Query, TanStack Table, React Hook Form, Zustand |
| Background Worker | Node.js, BullMQ (Redis queue), tsx watch |
| Browser Automation | Playwright 1.57 + puppeteer-extra-plugin-stealth |
| AI Integration | Vercel AI SDK (OpenAI / Anthropic / Google via `AI_PROVIDER` env) |
| Database | PostgreSQL 18 + Drizzle ORM, Redis 8 |
| Email | Resend + React Email |
| Infrastructure | Docker Compose (local), Coolify on DigitalOcean (prod), GitHub Actions CI/CD |

**Database Access Rule:** Always use the Drizzle query builder (`db.select()`, `db.insert()`, `db.query.*`). Never use raw SQL via `db.execute()` unless unavoidable. Use `sql` template tag only for inline expressions (e.g. `COALESCE`).

**Migration Rule (since 007):** Schema changes ship as **versioned, committed migrations**, not `drizzle-kit push`. Workflow: edit `packages/db/src/schema.ts` → `pnpm --filter @price-monitor/db generate` (writes SQL to `packages/db/drizzle/`, commit it) → apply with `pnpm --filter @price-monitor/db migrate` (programmatic migrator in `src/migrate.ts`). In prod, a **single** gated worker auto-applies pending migrations on startup when `RUN_MIGRATIONS=true` (before it begins consuming jobs); `migrate` is also the manual apply fallback. Keep migrations **additive** so a rolling deploy's old code keeps working. `push` remains for throwaway local experiments only.

**Environment Loading Rule:** There is **one** `.env` file — the monorepo root `.env`. Each runnable component loads it directly at startup; nothing relies on side-effect imports.

| Component | How it loads root `.env` |
|---|---|
| `apps/web` | `dotenv.config()` at the top of `next.config.mjs` (runs before Next.js evaluates config) |
| `apps/worker` | `dotenv.config()` in `src/config.ts`, imported early by `src/index.ts` |
| `apps/mcp-server` | `dotenv.config()` at the very top of `src/index.ts` (with `quiet: true` so the dotenv banner never reaches stdout in stdio mode) |
| `packages/db` (drizzle-kit CLI only) | `dotenv.config()` in `drizzle.config.ts` for `pnpm --filter @price-monitor/db push/generate/studio` |

The `packages/db` runtime library does **not** load env on its own — it expects `DATABASE_URL` to already be in `process.env`. In production (Coolify) the `.env` file does not exist, dotenv silently no-ops, and container env vars supplied by Coolify win.

---

## Repository Structure

```
apps/
  web/         # Next.js app — dashboard UI, chat page, REST + /api/chat streaming API
  worker/      # BullMQ consumer — extraction, DB writes, email
  mcp-server/  # Custom MCP server exposing typed tools to the chat agent (stdio for IDE, HTTP for app-to-app)
packages/
  db/          # Shared Drizzle schema + DB client + versioned migrations (@price-monitor/db)
  reporting/   # Shared email rendering/sending — React Email digest, report snapshot (@price-monitor/reporting); used by both web (manual-report routes) and worker (emailService)
specs/         # Feature specs, plans, tasks per feature (e.g. 001-*, 002-*)
docs/          # Production environment reference
scripts/       # Utility scripts
```

---

## Essential Commands

```bash
# Dev environment
pnpm docker:up                            # Start PostgreSQL + Redis
pnpm --filter @price-monitor/web dev      # Next.js dev server (port 3000)
pnpm worker:dev                           # Dev worker (auto-manages Docker worker)
pnpm lint                                 # Biome lint over every workspace + scripts
pnpm lint:fix                             # apply Biome safe + unsafe fixes (review the diff)

# Tests (all workspaces — runs Vitest in web, worker, mcp-server, db, reporting)
pnpm test                                 # Run every workspace's test script (Vitest)
pnpm --filter @price-monitor/web test     # Web tests only
pnpm --filter @price-monitor/worker test  # Worker tests only
pnpm --filter @price-monitor/mcp-server test  # MCP server tests only

# MCP server (chat agent backend)
pnpm mcp:dev                              # Dev MCP server via scripts/dev-mcp.sh (auto-manages Docker mcp-server)
pnpm mcp:up / mcp:down / mcp:logs         # Docker mcp-server lifecycle (profile "mcp")

# Database (versioned migrations — see Migration Rule above)
pnpm --filter @price-monitor/db generate  # Generate a new migration from schema.ts changes
pnpm --filter @price-monitor/db migrate   # Apply pending committed migrations
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio
pnpm --filter @price-monitor/db push      # Throwaway local experiments only (not for shipped changes)

# Docker worker (background)
pnpm worker:up         # rebuild image and start Docker worker (always rebuilds with --build)
pnpm worker:down       # stop Docker worker
pnpm worker:logs       # tail Docker worker logs
pnpm worker:restart    # restart Docker worker (no rebuild)

# Backfill rich metadata for existing products (one-off; enqueues update-product-info for every product)
pnpm --filter @price-monitor/worker backfill:product-info
```

The Docker worker uses `profiles: ["worker"]` — `pnpm docker:up` only starts PostgreSQL and Redis. `pnpm worker:dev` (from repo root) and `pnpm dev` (from `apps/worker/`) both route through `scripts/dev-worker.sh`: stop the Docker worker, run the local dev worker with tsx watch, then restart the Docker worker on exit (Ctrl+C). The Docker `mcp-server` (`profiles: ["mcp"]`) and `pnpm mcp:dev` (`scripts/dev-mcp.sh`) follow the same swap pattern.

---

## Architecture

### Data Model

**products** — URL (unique key), name, imageUrl, active, lastSuccessAt, lastFailedAt, plus rich metadata (007): `description`, `category`, `brand`, `countryOfOrigin`, `attributes` (JSONB — ordered key/value spec list, capped at 100, see `packages/db/src/attributes.ts`), `infoUpdatedAt`
**priceRecords** — productId (FK cascade), price (integer cents), currency, scrapedAt
**settings** — key/value JSON store (email schedule, etc.)
**runLogs** — job status/error tracking (no FK on productId for flexibility)

Prices stored as **integer cents** to avoid floating-point issues. Products auto-created on first URL check. Metadata (slow-changing) is **decoupled** from price (fast-changing): a plain price check never touches metadata; metadata is only (re)extracted by the `update-product-info` operation, which **overwrites** the full metadata set (fields not found this run are blanked).

### Extraction Pipeline (2-Tier)

1. **Tier 1 — HTML Fetcher** (~100-500ms): HTTP fetch + Cheerio + CSS selector extraction (price only)
2. **Tier 2 — Playwright + AI** (~3-6s): Headless Chromium with stealth, tries selectors first, falls back to AI (Zod-validated). Singleton browser reused across jobs.

Set `FORCE_AI_EXTRACTION=true` to skip Tier 1. **Rich metadata extraction always uses the AI tier** (Tier 1 has no notion of description/specs); the `ProductInfoSchema` is written for OpenAI strict-mode compatibility.

### Job Flow (BullMQ)

Job types (see `apps/worker/src/queue/worker.ts`): `check-price`, `update-product-info`, `send-digest` / `send-digest-scheduled` (same handler), `send-digest-flow` (FlowProducer parent).

- **Manual price check:** API → `check-price` job → Worker extracts price → saves price record (metadata untouched)
- **Update product info:** API (`products/[id]/update-info`) or first add → `update-product-info` job → Worker extracts metadata + a fresh price → overwrites metadata + writes price record + sets `infoUpdatedAt`. The route waits up to ~45s for the job (synchronous result) and reports "still processing" on wait-timeout.
- **Digest:** `send-digest` job → spawns a refresh flow over active products → calculates trends → sends email. The job payload carries a **mode**: `"price"` (default — cheap price-only refresh) or `"info"` (full metadata+price refresh per product). `digest/trigger` accepts `{ mode: "info" }`.
- **Scheduled digest:** Worker startup → reads schedule from DB → registers BullMQ repeatable job (polls DB every 5 min for updates)

Queue name: `price-monitor-queue`. In production, only ONE worker should have `ENABLE_SCHEDULER=true`. The worker starts with `autorun: false` and only calls `worker.run()` **after** applying pending migrations (when `RUN_MIGRATIONS=true`).

### API Routes (`apps/web/src/app/api/`)

```
products/                    GET (list), POST (create)
products/[id]/               GET, PATCH, DELETE
products/[id]/check-price/   POST  (price-only refresh)
products/[id]/update-info/   POST  (full metadata+price refresh; waits for the job, ~45s)
chat/                        POST  (streaming AI chat — Node runtime, MCP tools)
digest/trigger/              POST  ({ mode?: "price" | "info" })
digest/status/               GET
manual-report/preview/       POST  (render a digest preview without sending)
manual-report/send/          POST  (send an ad-hoc report email)
settings/email-schedule/     GET, POST
mcp/tools/                   GET   (list MCP tools via web→mcp-server bridge)
mcp-server/health/           GET   (proxy to mcp-server /mcp/health)
worker/health/               GET   (proxy to worker)
health/                      GET
```

### Web App UI (`apps/web/src/app/(main)/dashboard/`)

- `default/` — dashboard overview
- `products/` — product list (card + table views), edit dialog, global search, and a reusable **product detail dialog** (007 — image, source link, current price + trend, and the rich metadata incl. a key/value spec list) opened from a card/row
- `chat/` — streaming AI chat page with markdown rendering and inline tool-call indicators
- `finance/` — analytics/KPIs
- `send-report/` — ad-hoc report preview + send (backed by `manual-report/*` API)
- `settings/` — email schedule config

Global product search is implemented as a dialog provider in `_components/product-search/`.

### AI Chat Agent + MCP

- **Three-app topology** — In production, `web`, `worker`, and `mcp-server` are three independent Coolify applications on the same internal Docker network. The chat path is: browser → `web` (Next.js `/api/chat`) → `mcp-server` (HTTP) → Postgres / Redis. The MCP server is internal-only — no public domain, no HTTPS termination.
- **Dev/prod transport split** — The MCP server speaks two transports selected by `MCP_TRANSPORT`:
  - `stdio` (default) — spawned as a child process by the **IDE** (VSCode / Cursor) for local development. Stdout is reserved for JSON-RPC frames; all logs go to stderr.
  - `http` — Streamable HTTP on `MCP_HTTP_PORT` (default `3002`). Used by `web → mcp-server` in **both dev (Docker container) and prod (Coolify app)**. Stateless: every request creates a fresh `StreamableHTTPServerTransport` so no per-session state lingers, which makes the service horizontally scalable and lets `web` and `mcp-server` scale independently.
- **MCP server (`apps/mcp-server/`)** — standalone Node process using `@modelcontextprotocol/sdk`. Exposes typed tools (`search_products`, `get_product_history`, `get_price_summary`, `add_product`, `ping`) backed by Drizzle queries and the BullMQ queue. Direct SQL access from the agent is intentionally not exposed. All tool errors flow through `tools/_wrap.ts` into a structured `{ error: { code, message } }` shape. HTTP mode also exposes `GET /health` (Coolify health probe) and `GET /mcp/health` (alias used by web's MCP-health proxy route). Test-only tools (`slow_ping`, `throw_test`) are hard-gated on `NODE_ENV !== "production"`.
- **MCP client (`apps/web/src/lib/mcp/client.ts`)** — singleton client that picks the transport at first connect: `StreamableHTTPClientTransport(MCP_HTTP_URL)` when `MCP_HTTP_URL` is set (production + Docker dev), otherwise `StdioClientTransport` spawning `pnpm --filter @price-monitor/mcp-server start` (the IDE-style fallback). Override the stdio command via `MCP_SERVER_COMMAND` / `MCP_SERVER_ARGS`.
- **Chat API (`apps/web/src/app/api/chat/route.ts`)** — Node-runtime route using Vercel AI SDK `streamText` with MCP tools bridged via `buildMcpTools` (in `apps/web/src/lib/ai/chat-tools.ts`). Enforces `CHAT_MAX_STEPS` (5-step tool budget) and `CHAT_TURN_TIMEOUT_MS` (60s). Errors surface as documented `ChatErrorCode` values: `validation_error`, `provider_config_missing`, `mcp_unreachable`, `step_budget_exceeded`, `turn_timeout`, `empty_response`, `provider_error`.
- **Provider selection** — same `AI_PROVIDER` env var as the worker (`openai` | `anthropic` | `google`).
- **Domain guardrail** — `CHAT_SYSTEM_PROMPT` restricts the agent to product / price / monitor topics.

---

## Lint & Tests

**Lint** is Biome, configured at the repo root (`biome.json`). The web workspace
keeps its own `apps/web/biome.json` (marked `"root": false`) for React/Next/
Tailwind-specific rules; Biome auto-picks the nested config for files under
`apps/web/`. Running `pnpm lint` from the root walks the whole monorepo
(workspaces, packages, scripts).

- `pnpm lint` — read-only check; CI-equivalent gate.
- `pnpm lint:fix` — applies Biome's safe + unsafe autofixes. **Always review
  the diff** — unsafe fixes can drop write-only fields (e.g. private class
  members assigned but never read) and rewrite `isNaN` to `Number.isNaN`.

**Tests** run with Vitest in every workspace that ships code. There is no CI
pipeline for tests — they are a local pre-commit gate. The contract is:

- Tests live next to the file they cover: `src/foo/bar.ts` →
  `src/foo/bar.test.ts` (or `.test.tsx` for React components). Web has a
  parallel `src/test/` tree for dashboard-page / API-route tests that need
  cross-cutting setup.
- Each workspace has its own `vitest.config.ts`; `passWithNoTests: true` is
  set on the package configs so the root `pnpm test` doesn't fail an empty
  package.
- Shared web jsdom setup (matchMedia, ResizeObserver, IntersectionObserver
  mocks) lives in `apps/web/src/test/setup.ts`.

**Workflow rule for contributors and AI agents:**

> When you change application code, add or update the colocated test file
> in the same change, and run `pnpm test` (and `pnpm lint`) before opening a
> PR. Tests are the only mechanism we have to keep refactors and AI-assisted
> edits from regressing existing behavior.

If a test file you touch needs a backend (Postgres/Redis/Resend), mock it at
the module boundary — see `apps/worker/src/jobs/priceCheck.test.ts` and
`apps/mcp-server/src/tools/*.test.ts` for the chainable-Drizzle mock pattern.

## Spec-Driven Development (SDD with Speckit)

Features follow a speckit SDD workflow. Specs live in `specs/<NNN>-<feature-name>/` and contain:
- `spec.md` — feature requirements and context (primary source of truth for intent)
- `plan.md` — implementation design
- `tasks.md` — actionable task breakdown

**When working on a feature, always read `spec.md` first** to understand intent and scope. Specs accumulate history and context not visible in code or git log.

Top-level `specs/` files (`spec.md`, `plan.md`, `tasks.md`) represent the most recent active feature.

---

## Git Workflow

**Branches:** `feature/*` → `dev` → `main`
**Deployment:** Merge to `main` → GitHub Actions builds → GHCR → Coolify auto-deploys

Only create commits when explicitly requested.

## Active Technologies
- TypeScript 5.9 + Next.js 16 (App Router), React 19, Tailwind CSS v4, Shadcn UI, TanStack Query/Table, Zustand, Drizzle ORM, PostgreSQL 18, Redis 8, BullMQ, Playwright, Vercel AI SDK (OpenAI / Anthropic / Google), `@modelcontextprotocol/sdk`, `streamdown` (Markdown rendering), Resend + React Email
- 007-extend-product-info: Versioned Drizzle migrations (`generate` → committed `packages/db/drizzle/` → `migrate`) replacing `push`; additive product metadata columns (description / category / brand / country_of_origin / `attributes` JSONB ≤100 pairs / `info_updated_at`).

## Recent Changes
- 007-extend-product-info: Rich product metadata (description, category, brand, country, key/value specs) via a new `update-product-info` operation (on add / on demand / batch info+price digest mode) that uses the AI tier and overwrites metadata; reusable product detail dialog; backfill script. Schema delivered as versioned, additive migrations auto-applied on deploy by a single gated instance (`RUN_MIGRATIONS`), with a manual apply fallback.
- 006-mcp-http-transport: Add HTTP transport mode to MCP server (`POST /mcp` + `GET /health` + `GET /mcp/health` on port 3002) alongside the existing stdio transport, with stateless Streamable HTTP, 30s per-request timeout, and 10s graceful shutdown. Test-only tools (`slow_ping`, `throw_test`) are gated on `NODE_ENV !== "production"` so a stray `MCP_TEST_TOOLS=1` cannot leak them into a prod deploy.
- 005-chat-page-ui: Dashboard chat page streaming `/api/chat` responses with sanitized markdown, inline tool-call indicators, and per-tab in-memory conversation state
- 004-chat-streaming-api: Add `/api/chat` streaming route with MCP tool-calling, provider abstraction, and structured error taxonomy

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
