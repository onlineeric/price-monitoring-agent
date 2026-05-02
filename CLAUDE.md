# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

---

## Repository Structure

```
apps/
  web/         # Next.js app — dashboard UI, chat page, REST + /api/chat streaming API
  worker/      # BullMQ consumer — extraction, DB writes, email
  mcp-server/  # Custom MCP server (stdio) exposing typed tools to the chat agent
packages/
  db/          # Shared Drizzle schema + DB client (@price-monitor/db)
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
pnpm dev:worker                           # Dev worker (auto-manages Docker worker)
pnpm lint                                 # Biome lint

# Tests (web app)
pnpm --filter @price-monitor/web test     # Run all Vitest tests
pnpm --filter @price-monitor/web test -- --reporter=verbose  # Verbose output

# Database
pnpm --filter @price-monitor/db push      # Push schema to DB
pnpm --filter @price-monitor/db generate  # Generate migrations
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio

# Docker worker (background)
pnpm worker:up         # rebuild image and start Docker worker (always rebuilds with --build)
pnpm worker:down       # stop Docker worker
pnpm worker:logs       # tail Docker worker logs
pnpm worker:restart    # restart Docker worker (no rebuild)
```

The Docker worker uses `profiles: ["worker"]` — `pnpm docker:up` only starts PostgreSQL and Redis. `pnpm dev:worker` (from repo root) and `pnpm dev` (from `apps/worker/`) both route through `scripts/dev-worker.sh`: stop the Docker worker, run the local dev worker with tsx watch, then restart the Docker worker on exit (Ctrl+C).

---

## Architecture

### Data Model

**products** — URL (unique key), name, imageUrl, active, lastSuccessAt, lastFailedAt
**priceRecords** — productId (FK cascade), price (integer cents), currency, scrapedAt
**settings** — key/value JSON store (email schedule, etc.)
**runLogs** — job status/error tracking (no FK on productId for flexibility)

Prices stored as **integer cents** to avoid floating-point issues. Products auto-created on first URL check.

### Extraction Pipeline (2-Tier)

1. **Tier 1 — HTML Fetcher** (~100-500ms): HTTP fetch + Cheerio + CSS selector extraction
2. **Tier 2 — Playwright + AI** (~3-6s): Headless Chromium with stealth, tries selectors first, falls back to AI (Zod-validated). Singleton browser reused across jobs.

Set `FORCE_AI_EXTRACTION=true` to skip Tier 1.

### Job Flow (BullMQ)

- **Manual check:** API → `check-price` job → Worker extracts → saves to DB
- **Digest:** `send-digest` job → Worker spawns `check-price` jobs → calculates trends → sends email
- **Scheduled digest:** Worker startup → reads schedule from DB → registers BullMQ repeatable job (polls DB every 5 min for updates)

Queue name: `price-monitor-queue`. In production, only ONE worker should have `ENABLE_SCHEDULER=true`.

### API Routes (`apps/web/src/app/api/`)

```
products/           GET (list), POST (create)
products/[id]/      GET, PATCH, DELETE
products/[id]/check-price/  POST
digest/trigger/     POST
settings/email-schedule/    GET, POST
health/             GET
worker/health/      GET (proxy to worker)
```

### Web App UI (`apps/web/src/app/(main)/dashboard/`)

- `default/` — dashboard overview
- `products/` — product list (card + table views), edit dialog, global search
- `chat/` — streaming AI chat page with markdown rendering and inline tool-call indicators
- `finance/` — analytics/KPIs
- `settings/` — email schedule config

Global product search is implemented as a dialog provider in `_components/product-search/`.

### AI Chat Agent + MCP

- **MCP server (`apps/mcp-server/`)** — standalone Node process over stdio using `@modelcontextprotocol/sdk`. Exposes typed tools (`search_products`, `get_product_history`, `get_price_summary`, `add_product`) backed by Drizzle queries and the BullMQ queue. Direct SQL access from the agent is intentionally not exposed. All tool errors flow through `tools/_wrap.ts` into a structured `{ error: { code, message } }` shape.
- **MCP client (`apps/web/src/lib/mcp/client.ts`)** — singleton stdio client that spawns the MCP server via `pnpm --filter @price-monitor/mcp-server start`. Override with `MCP_SERVER_COMMAND` / `MCP_SERVER_ARGS` env vars.
- **Chat API (`apps/web/src/app/api/chat/route.ts`)** — Node-runtime route using Vercel AI SDK `streamText` with MCP tools bridged via `buildMcpTools` (in `apps/web/src/lib/ai/chat-tools.ts`). Enforces `CHAT_MAX_STEPS` (5-step tool budget) and `CHAT_TURN_TIMEOUT_MS` (60s). Errors surface as documented `ChatErrorCode` values: `validation_error`, `provider_config_missing`, `mcp_unreachable`, `step_budget_exceeded`, `turn_timeout`, `empty_response`, `provider_error`.
- **Provider selection** — same `AI_PROVIDER` env var as the worker (`openai` | `anthropic` | `google`).
- **Domain guardrail** — `CHAT_SYSTEM_PROMPT` restricts the agent to product / price / monitor topics.

---

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

## Recent Changes
- 005-chat-page-ui: Dashboard chat page streaming `/api/chat` responses with sanitized markdown, inline tool-call indicators, and per-tab in-memory conversation state
- 004-chat-streaming-api: Add `/api/chat` streaming route with MCP tool-calling, provider abstraction, and structured error taxonomy
- 003-send-report-email: Introduce manual report preview/send flow with Redis-backed safeguards and shared `packages/reporting`
