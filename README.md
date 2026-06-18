# Price Monitor AI Agent

A full-stack **AI agent** portfolio project by Eric Cheng, built first and foremost to demonstrate **AI agent & AI integration** engineering — and backed by production-grade **full-stack product** development.

The app monitors product prices from arbitrary URLs and emails trend digests, but the product is the vehicle. The focus is the AI and platform engineering behind it:

- a **conversational AI agent** that drives the app through a custom **MCP server** (typed, Zod-validated tools — the model has no raw SQL access),
- **RAG semantic search** that finds products by *meaning* over a **pgvector** vector store, powered by a **locally-hosted MiniLM embedding model** that runs offline,
- **structured AI extraction** (Vercel AI SDK + Zod) used as a smart fallback for difficult pages, not the default for every request,
- all on an **event-driven** Next.js 16 / React 19 / Redis + BullMQ / PostgreSQL platform with a Dockerized, CI/CD-deployed background worker.

**Live demo**  
https://price-monitor.onlineeric.net/

## System architecture

![Price Monitoring Agent system architecture — web app, data layer, background services, and external integrations, with synchronous request/response and asynchronous BullMQ job flows](docs/architecture-phase4.svg)

The whole system at a glance: an AI chat agent and dashboard (Next.js), a custom MCP server that owns semantic search and the local embedding model, an event-driven background worker, and a PostgreSQL + pgvector / Redis data layer. Solid lines are synchronous request/response calls; dashed lines are asynchronous BullMQ jobs.

## What this project demonstrates

This is a portfolio project: the price-monitoring product is real and end-to-end, but it exists to showcase two things, in priority order.

### 1. AI agent & AI integration — *primary focus*

- **Conversational AI agent** — multi-step tool calling over a custom Model Context Protocol (MCP) server, streaming UI, multi-turn history, and clickable product cards wired back into the app.
- **RAG semantic search** — find products by *meaning* (not keyword overlap) over a pgvector vector store, with a single **locally-hosted `all-MiniLM-L6-v2`** model owning both query-time and write-time embeddings, paid for once in RAM.
- **Typed, Zod-validated MCP tools** — keyword + semantic search, price history, trend summaries, add product. The model has no SQL access; every action is bounded by a validated schema.
- **Structured AI extraction** — Vercel AI SDK `generateObject()` with strict Zod schemas, used as a fallback for difficult pages rather than the default for every request.
- **Provider abstraction** — OpenAI, Anthropic, and Google switchable via one env var, for both extraction and chat.
- **Production guardrails** — per-turn step budget, turn timeout, structured error taxonomy, and a domain-restricted system prompt.

### 2. Full-stack product engineering — *secondary focus*

- **Event-driven architecture** — BullMQ on Redis decouples the web app from a background worker; jobs cover price checks, metadata enrichment, vector reindex, digests, and scheduler-managed repeatable work.
- **Modern full-stack** — Next.js 16 App Router, React 19, TypeScript, TanStack Query/Table, Shadcn UI.
- **Typed data layer** — Drizzle ORM over PostgreSQL 18 + pgvector, a shared schema package across web, worker, and MCP server, with versioned, auto-applied migrations.
- **Backend worker** — 2-tier extraction (Cheerio → Playwright + stealth), a worker-managed scheduler (no external cron), and digest fan-out via a FlowProducer.
- **Production operations** — three independent Dockerized services on one network, health endpoints, GitHub Actions CI/CD to GHCR, and self-hosted Coolify deployment.

## AI chat agent with MCP

A dedicated `/dashboard/chat` page lets users talk to the price monitor in natural language. The chat page streams responses from `/api/chat`, which invokes a custom Model Context Protocol (MCP) server to read and write the same database the dashboard uses. The AI agent has no SQL access, only the typed tools below.

```text
Browser (chat UI, streamed)
        |
        v
Next.js /api/chat  (Vercel AI SDK streamText, multi-step tool calls)
        |
        v
MCP client  --->  apps/mcp-server  (typed tools, Zod-validated)
 (HTTP / stdio)            |          + local embedding model
                          v
        PostgreSQL (+ pgvector)  +  BullMQ queue
```

- **Custom MCP server (`apps/mcp-server/`):** standalone Node process using `@modelcontextprotocol/sdk`, speaking two transports selected by `MCP_TRANSPORT` — stateless Streamable HTTP (web → mcp-server in Docker dev and production) and stdio (spawned by the IDE for local tool inspection). Tools: `search_products` (keyword), `semantic_search_products` (meaning-based, pgvector RAG), `get_product_history`, `get_price_summary`, `add_product` (which enqueues an `update-product-info` BullMQ job so chat-added products start enriched and searchable), and `ping`. It also serves `GET /health`, `GET /mcp/health`, and the internal-only `POST /internal/reindex` (not an MCP tool). All tool inputs are Zod schemas; failures are wrapped into a structured `{ error: { code, message } }` shape.
- **Streaming chat API:** `apps/web/src/app/api/chat/route.ts` runs on the Node runtime, bridges live MCP tools into AI SDK `tool()` instances, enforces a 5-step tool budget and 60-second per-turn timeout, and returns the AI SDK v6 UI-message protocol with a structured error taxonomy (`validation_error`, `provider_config_missing`, `mcp_unreachable`, `step_budget_exceeded`, `turn_timeout`, `empty_response`, `provider_error`).
- **Provider abstraction:** the same `AI_PROVIDER` env var that drives the worker's extraction fallback (`openai` | `anthropic` | `google`) selects the chat model.
- **Clickable products in replies:** when a reply retrieves products (keyword or semantic), they render as a deduplicated, clickable card list (≤5 + "+N more matched") and the product names mentioned in prose become inline `#product-<id>` links. Both open the same reusable **ProductDetailDialog** used across the dashboard — image, price + trend, full metadata, specs, source link, and the "Check price now" / "Update product info" actions — via a `ChatProductDialogProvider`, all without leaving the chat. Inline mentions that can't be resolved degrade to plain text.
- **Multi-turn UI:** Zustand-backed in-memory chat state, sanitized markdown rendering via `streamdown`, and inline tool-call indicators that show which tool ran, the arguments, and the result for demo transparency.
- **Domain guardrail:** the system prompt restricts the agent to product / price / monitor topics so it politely declines off-topic requests.
- **Transport selection:** the web MCP client (`apps/web/src/lib/mcp/client.ts`) picks `StreamableHTTPClientTransport` when `MCP_HTTP_URL` is set (production and Docker dev), otherwise falls back to spawning the server over stdio for the IDE workflow.
- **Local dev:** the same MCP server is registered in VSCode/Cursor, so the tools can be inspected with `npx @modelcontextprotocol/inspector` or driven directly from the IDE.

## Semantic product search (RAG over pgvector)

Once products carry rich metadata, the chat agent can search them by *meaning*
instead of literal keyword overlap — "find me a gaming monitor good for video
editing" surfaces the right product even when those words appear nowhere in its
name. This is a Retrieval-Augmented Generation pipeline built end-to-end in the
repo.

```text
Product metadata  -->  composite document  -->  token-accurate chunks  -->  MiniLM vectors
(007 fields, priority-ordered)      (~200-token fragments, overlap)        product_embeddings (vector(384))
                                                                                   |
chat query  -->  embed query (same model)  -->  pgvector cosine KNN (HNSW)  -->  best fragment per product
```

- **Single embedding authority:** the `mcp-server` is the **only** process that loads the local `Xenova/all-MiniLM-L6-v2` model (384-dim, int8-quantized, via `@huggingface/transformers`). It owns both query-time embedding (search) and write-time embedding (reindex/backfill), so the model's ~300 MB RAM cost is paid exactly once — keeping the production droplet within budget. The worker never embeds; it enqueues.
- **Index construction:** each product's 007 metadata is assembled into a priority-ordered composite document (name → brand → category → country → description → specs), split into bounded ~200-token fragments with overlap (`@langchain/textsplitters`) so long descriptions and big spec lists are never silently truncated, and stored one row per (product, fragment) in `product_embeddings`.
- **Vector store:** PostgreSQL 18 + pgvector, a `vector(384)` column with an HNSW cosine index, queried Drizzle-native via `cosineDistance`. Retrieval collapses each product to its single best-matching fragment, so a long product appears once, not once per fragment.
- **Relevance, not nearest:** a configurable cosine-distance threshold (and top-N, default 5) means an off-topic query returns an empty set rather than the nearest-but-irrelevant product.
- **Freshness:** vectors are rebuilt (delete-and-replace, atomic) only when metadata is (re)extracted. After an `update-product-info` write the worker enqueues a **retryable** `reindex-product-embeddings` job (5 attempts, backoff) that POSTs the mcp-server's internal `/internal/reindex` endpoint — a transient embedding-side blip self-heals without ever failing the metadata/price write. A one-off `backfill:embeddings` script indexes the existing catalog idempotently.
- **Provider seam:** `EMBEDDING_PROVIDER` is an abstraction (local default); switching providers is a deliberate dimension-change migration, not a runtime toggle.

## AI extraction pipeline

This repository uses AI where it adds clear value: as a fallback for difficult pages, not as the default for every request.

- **Fast path:** `fetch()` + Cheerio handles simple product pages cheaply and quickly (price-only).
- **Rendered fallback:** Playwright loads JavaScript-heavy pages, waits for DOM stability, and retries extraction with browser-side selectors.
- **AI fallback:** Vercel AI SDK `generateObject()` extracts `title`, `price`, `currency`, and `imageUrl` into a strict Zod schema.
- **Rich metadata extraction:** the `update-product-info` operation always uses the AI tier with an OpenAI strict-mode-compatible schema to also pull `description`, `category`, `brand`, `countryOfOrigin`, and up to 100 key/value specs — overwriting the full set on each successful run.
- **Price / metadata decoupling:** routine price checks stay on the cheap path and never run metadata extraction; the expensive AI metadata refresh runs only on add, on demand, or in an explicit batch.
- **Provider flexibility:** OpenAI, Anthropic, and Google providers are switchable through environment variables.
- **Operational detail:** the worker reuses a singleton browser instance and exposes a health server for deployment checks.

## Product capabilities

- Add a product URL and immediately enqueue a full info + price extraction so the product starts enriched
- Capture rich product metadata — description, category, brand, country of origin, and a key/value spec list (up to 100) — via an on-demand "Update product info" action, kept separate from cheap price-only checks
- Open a reusable product detail dialog (image, source link, price + trend, full metadata and specs) from card view, table view, and chat
- Manage products with create, edit, delete, active/inactive state, and manual re-check / update-info actions
- Browse monitored products in card or table views with recent price history
- Use global product search to quickly locate and edit products from anywhere in the dashboard
- Chat with an AI agent that can do keyword **and** semantic (meaning-based) product search, summarize price trends, retrieve history, and add new products through MCP tool calls
- Open any product the chat agent surfaces directly from the reply — as clickable cards (deduped, top 5 + "+N more") and inline `#product-<id>` mentions — without leaving the conversation
- Configure daily or weekly email digest schedules from the UI
- Trigger a "check all products and send digest" run manually, choosing price-only or full info + price refresh
- Track historical prices and compare current price vs last check and 7/30/90/180 day averages

## How the system works

```text
Next.js dashboard + API routes  ----------------->  mcp-server (embedding authority)
        |                                             - local MiniLM model
        v                                             - semantic search over pgvector
BullMQ queue on Redis  <---- reindex (HTTP) -----     - rebuilds product_embeddings
        |
        v
Node worker
  - HTML fetch + Cheerio
  - Playwright + stealth
  - AI structured extraction (price + rich metadata) fallback
        |
        v
PostgreSQL 18 + pgvector  (price history, metadata, embedding vectors)
        |
        v
Resend email digests
```

### End-to-end flow

1. A user adds a product URL in the web app (or via the chat agent's `add_product` tool).
2. The Next.js API stores the product and enqueues an `update-product-info` job (full metadata + price), so the product starts enriched rather than price-only.
3. The worker attempts extraction in tiers:
   - Tier 1: direct HTTP fetch plus Cheerio selectors (price-only fast path)
   - Tier 2: Playwright-rendered page plus selector extraction
   - Tier 3: AI extraction with typed Zod validation — price, currency, image, and (for info refreshes) the rich metadata set
4. The latest result is stored in PostgreSQL as a new price record; an info refresh also overwrites the product's metadata.
5. After a metadata write, the worker best-effort enqueues a retryable `reindex-product-embeddings` job; the mcp-server rebuilds that product's vector index so semantic search stays current.
6. Routine price-only `check-price` jobs refresh just the price and never touch metadata or vectors.
7. Scheduled or manual digest jobs fan out refreshes (price-only or info + price) for all active products, calculate trends, and send a summary email.

## Tech stack

| Area | Technologies |
| --- | --- |
| Web app | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, Shadcn UI, Radix primitives, Sonner, Lucide |
| Forms and validation | React Hook Form, Zod |
| Data access | Drizzle ORM, PostgreSQL 18, pgvector |
| Queue and background jobs | BullMQ, Redis 8 |
| Extraction | Cheerio, Playwright, Playwright Extra, `puppeteer-extra-plugin-stealth` |
| AI | Vercel AI SDK, OpenAI, Anthropic, Google, `@modelcontextprotocol/sdk`, `streamdown` |
| Embeddings / RAG | Local `all-MiniLM-L6-v2` via `@huggingface/transformers`, `@langchain/textsplitters`, pgvector (HNSW cosine) |
| Email | Resend, React Email |
| Testing | Vitest, Testing Library, jsdom |
| DevOps | Docker Compose, GitHub Actions, GHCR, Coolify |

## Engineering details worth noting

- **Worker-managed scheduling:** one worker instance owns BullMQ repeatable jobs, avoiding external cron dependencies.
- **Digest orchestration:** a `send-digest-flow` FlowProducer fans out child refresh jobs (price-only or info + price) for each active product, then sends the email after all complete.
- **Single embedding authority:** only the mcp-server loads the embedding model, so its RAM cost is paid once; the worker and backfill scripts enqueue/POST reindex work rather than embedding themselves.
- **Self-healing reindex:** `reindex-product-embeddings` is a retryable job (backoff) decoupled from the metadata write, so a brief mcp-server outage never fails an `update-product-info` run and the index catches up on its own.
- **Versioned, auto-applied migrations:** schema changes ship as committed Drizzle migrations; in production a single gated worker (`RUN_MIGRATIONS=true`) auto-applies pending migrations on startup before consuming jobs, and migrations are kept additive so rolling deploys stay safe.
- **Health monitoring:** the web app exposes `/api/health`, the worker exposes its own `/health` endpoint plus a proxied web route, and the mcp-server exposes `/health` and `/mcp/health`.
- **Typed persistence:** products (with rich metadata), price records, embedding fragments, run logs, and settings are defined in a shared Drizzle schema package.
- **Reusable detail dialog:** a single `ProductDetailDialog` is shared by the products page (card and table views) and the chat page, so product detail and its actions behave identically everywhere.

## Local development

### Prerequisites

- Node.js 20+
- pnpm
- Docker

### Quick start

```bash
pnpm install
cp .env.example .env
# configure at least one AI provider key; add Resend settings for digest emails
pnpm docker:up
pnpm --filter @price-monitor/db migrate   # apply committed migrations (see below)
pnpm worker:up
pnpm --filter @price-monitor/web dev
```

Open `http://localhost:3000/dashboard`.

### Database migrations

Schema changes ship as **versioned, committed Drizzle migrations** (the
canonical path); `drizzle-kit push` is kept only for quick local prototyping.

```bash
pnpm --filter @price-monitor/db generate   # author: diff schema.ts → drizzle/NNNN_*.sql (commit it)
pnpm --filter @price-monitor/db migrate     # apply pending migrations (idempotent, journalled)
```

In production the single gated worker (`RUN_MIGRATIONS=true`, the same instance
that owns `ENABLE_SCHEDULER=true`) auto-applies pending migrations on startup,
before it consumes any jobs. See [Database migrations](docs/migrations.md) for
the full workflow, the `IF NOT EXISTS` baseline, and the manual fallback.

### Development worker

If you want the worker in local watch mode instead of Docker:

```bash
pnpm --filter @price-monitor/worker exec playwright install chromium
pnpm worker:dev          # from repo root
# or equivalently:
cd apps/worker && pnpm dev
```

Both commands route through `scripts/dev-worker.sh`: temporarily stop the Docker worker, run the worker with `tsx watch`, then restore the Docker worker when you exit (Ctrl+C).

### Rebuilding the Docker worker image

After changing worker source code or dependencies, rebuild and restart the Docker worker:

```bash
pnpm worker:up    # rebuilds image (--build) and starts container
pnpm worker:down  # stop without rebuild
```

### Lint and tests

Lint and tests run across all workspaces from the repository root:

```bash
pnpm lint          # Biome lint over web, worker, mcp-server, packages, scripts
pnpm lint:fix      # apply Biome's safe + unsafe fixes (always review the diff)
pnpm test          # vitest run in every workspace that has a `test` script
```

Tests live alongside the code they cover (e.g. `src/lib/format.ts` →
`src/lib/format.test.ts`). The web workspace also has integration-flavoured
tests under `src/test/` for the dashboard pages and API routes.

The test suite is intentionally **not** wired into CI — it is meant to be run
locally before pushing. Whenever you change application code, also add or
update a colocated `*.test.ts` (or `*.test.tsx`) and run `pnpm test` to
confirm nothing regressed.

## Deployment

Deployment is automated through GitHub Actions and Coolify.

- Pushes to `dev` build `web:dev` and `worker:dev` images for CI validation.
- Pushes to `main` build `web:latest` and `worker:latest`, push them to GHCR, and trigger Coolify webhooks.
- The production setup runs three independent containers — `web`, `worker`, and the internal-only `mcp-server` — on the same Docker network, plus PostgreSQL (with pgvector) and Redis.
- The `mcp-server` image bakes the `all-MiniLM-L6-v2` embedding weights in at build time, so it loads the model offline at runtime — no model download on a $24/mo droplet, and the single model load stays within the host's RAM headroom.
- Only one production worker should have `ENABLE_SCHEDULER=true` to avoid duplicate scheduled emails. That same single worker also sets `RUN_MIGRATIONS=true` so it auto-applies pending DB migrations on startup before consuming jobs (see [Database migrations](docs/migrations.md)).

## Repository structure

```text
apps/
  web/         Next.js dashboard, chat page, REST + streaming API routes
  worker/      BullMQ worker, extraction pipeline, scheduler, email + reindex jobs
  mcp-server/  Custom MCP server — typed chat tools + the single embedding authority (semantic search, reindex)
packages/
  db/          Shared Drizzle schema, client, and versioned migrations
  reporting/   Shared email rendering/sending (React Email digest), used by web + worker
docs/          Deployment and environment notes
specs/         Per-feature spec / plan / tasks artifacts
scripts/       Local development and utility scripts
```

## Good entry points for technical review

- `apps/mcp-server/src/index.ts`
- `apps/mcp-server/src/tools/semantic-search-products.ts`
- `apps/mcp-server/src/embeddings/`
- `apps/web/src/app/api/chat/route.ts`
- `apps/web/src/lib/mcp/client.ts`
- `apps/web/src/lib/ai/chat-tools.ts`
- `apps/web/src/lib/chat/product-cards.ts`
- `apps/web/src/app/(main)/dashboard/chat`
- `apps/worker/src/services/scraper.ts`
- `apps/worker/src/services/playwrightFetcher.ts`
- `apps/worker/src/services/aiExtractor.ts`
- `apps/worker/src/jobs/updateProductInfo.ts`
- `apps/worker/src/jobs/reindexEmbeddings.ts`
- `apps/worker/src/jobs/sendDigest.ts`
- `apps/worker/src/scheduler.ts`
- `apps/web/src/app/api/products/route.ts`
- `apps/web/src/app/(main)/dashboard/products`
- `packages/db/src/schema.ts`
- `.github/workflows/build-and-push.yml`

## Additional documentation

- [Production environment reference](docs/production-env.md)
- [Database migrations](docs/migrations.md)
- [Docker troubleshooting](docs/troubleshooting-docker.md)
