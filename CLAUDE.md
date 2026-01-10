# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Price Monitor AI Agent - a system that monitors product prices from URLs, stores price history, and sends alerts for discounts. Uses traditional web extraction with AI fallback for complex pages.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend/API**: Next.js 16 (TypeScript) → Vercel
- **Worker**: Node.js (Docker) → Render
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Queue**: BullMQ with Redis (Upstash)
- **Extraction**: HTTP fetch + Playwright (fallback) + OpenAI (final fallback)
- **Email**: Resend with React Email templates

## Repository Structure

```
apps/
  web/       # Next.js app - API endpoints for triggering jobs
  worker/    # BullMQ consumer - extraction pipeline, DB writes, alerts
packages/
  db/        # Shared Drizzle schema and database client
specs/       # Architecture docs and task specs
```

### Current API Endpoints

**POST /api/debug/trigger**
- Enqueues a price check job by URL
- Body: `{ url: string }`
- Returns: `{ success: boolean, jobId: string }`

## Commands

### Root (pnpm workspaces)
```bash
pnpm install              # Install all dependencies
```

### Web App (apps/web)
```bash
pnpm --filter @price-monitor/web dev      # Start Next.js dev server
pnpm --filter @price-monitor/web build    # Production build
pnpm --filter @price-monitor/web lint     # Run ESLint
```

### Worker (apps/worker)
```bash
pnpm --filter @price-monitor/worker dev   # Run worker with hot reload
```

### Database (packages/db)
```bash
pnpm --filter @price-monitor/db generate  # Generate Drizzle migrations
pnpm --filter @price-monitor/db push      # Push schema to database
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio
```

### Local Development
```bash
docker-compose up -d                      # Start Redis for local development
docker-compose down                       # Stop Redis
```

## Architecture

### Job Flow
1. **Manual**: POST to `/api/debug/trigger` with URL → enqueues `check-price` job to BullMQ → Worker extracts and saves
2. **Scheduled**: (Not yet implemented) Vercel Cron will hit `/api/cron/check-all` → API queries active products → enqueues jobs for each

### Extraction Pipeline (2-Tier Fallback)
The worker implements a tiered extraction strategy with graceful fallbacks:

**Tier 1: HTML Fetcher** (fastest, ~100-500ms)
- Native fetch + Cheerio for static HTML
- Selector-based extraction (title, price, image)
- Multiple fallback selectors for common e-commerce patterns
- Speed: ~100-500ms | Cost: Free

**Tier 2: Playwright Fetcher** (robust + smart path)
- **Step 1**: Load page with Chromium (stealth mode)
  - playwright-extra + stealth plugin
  - Bypasses ~70-80% of bot detection
  - DOM stability detection (waits for dynamic content)
  - Singleton browser instance for efficiency
- **Step 2**: Try selector-based extraction
  - Same selectors as Tier 1, but on fully-rendered HTML
- **Step 3**: If selectors fail → AI with rendered HTML
  - Vercel AI SDK with multi-provider support (OpenAI, Google, Anthropic)
  - Structured output with Zod schema validation
  - HTML preprocessing: truncation, noise removal, semantic extraction
  - Returns price (in cents), title, currency
  - Speed: ~3-6s total | Cost: ~$0.001-0.01 per AI call

**Debug Mode**: Set `FORCE_AI_EXTRACTION=true` to bypass HTML fetcher and test AI directly

### Data Model
- **products**: URL (unique, natural key), name, imageUrl, active flag, cron schedule
- **priceRecords**: productId (FK cascade delete), price (in cents), currency, scrapedAt
- **alertRules**: productId (FK cascade delete), targetPrice, active flag
- **runLogs**: productId (no FK), status (SUCCESS/FAILED), errorMessage

Products are auto-created on first price check using URL as the natural key. All prices stored in cents to avoid floating-point precision issues.

## Environment Variables

Required in `.env` (place at monorepo root):

```bash
# PostgreSQL Database (Neon)
DATABASE_URL=""

# Connection string for the local Redis Docker container
REDIS_URL="redis://localhost:6379"

# AI Provider Selection (openai | google | anthropic)
AI_PROVIDER="anthropic"

# Provider API Keys
OPENAI_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""
ANTHROPIC_API_KEY=""

# AI data models
# OpenAI: "gpt-4o-mini", "gpt-5-mini", "gpt-5.1", "gpt-5.2"
# Anthropic: "claude-3-5-haiku-20241022", "claude-3-haiku-20240307", "claude-haiku-4-5"
# Google Gemini: "gemini-1.5-flash", "gemini-2.5-flash", "gemini-3-flash-preview"
OPENAI_MODEL="gpt-5-mini"
ANTHROPIC_MODEL="claude-haiku-4-5"
GOOGLE_MODEL="gemini-2.5-flash"

# Debug: Force AI extraction (bypass HTML fetcher and Playwright selectors)
FORCE_AI_EXTRACTION=false
```

Next.js automatically loads `.env` from the monorepo root via `next.config.ts`.

## Development Workflow

This project follows **Spec-Driven Development**. Task specifications are in the `specs/` folder (e.g., `specs/task-2.1.md`).

### Git Commit Conventions

Commit messages use task tags that match spec documents:

- **Single task**: `[task-2.1] complete task 2.1`
- **Multiple tasks**: `[task-1.1][task-1.2] update both specs`
- **No task**: `[misc] minor cleanup`

Tag format: `[task-X.Y]` corresponds to `specs/task-X.Y.md`.

## Key Implementation Details

### Product Auto-Creation
Products are automatically created when a price check job is submitted with a URL. The system uses URL as a natural key with `ON CONFLICT DO NOTHING` to ensure idempotent upserts.

### Worker Architecture
- **Singleton Browser**: Playwright browser instance is reused across jobs for efficiency
- **Graceful Shutdown**: Worker handles SIGTERM/SIGINT with proper cleanup
- **Hot Reload**: Development mode uses tsx watch for automatic restarts
- **Stealth Mode**: Uses playwright-extra + puppeteer-extra-plugin-stealth to bypass bot detection

### Price Parsing
The `priceParser` utility handles multiple formats:
- Multi-currency support (USD, EUR, GBP, JPY, etc.)
- European vs US number formats (€1.234,56 vs $1,234.56)
- Automatic currency symbol detection
- Relative-to-absolute URL conversion for images

### Queue Configuration
- Queue name: `price-monitor-queue`
- Job data: `{ url: string }` or legacy `{ productId: string }`
- Redis connection shared between web (producer) and worker (consumer)
- Hot reload singleton pattern in Next.js to prevent duplicate connections

## Implementation Status

Implementation is in progress. See `specs/implementation-plan.md` for full roadmap and `specs/task-*.md` for detailed task specs.
