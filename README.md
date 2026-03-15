# Price Monitor AI Agent

Price Monitor AI Agent is a full-stack portfolio project that tracks product prices from arbitrary URLs, stores historical price records, and sends automated digest emails with trend analysis.

The core engineering problem is extraction reliability. Instead of using AI as the first step, the worker starts with a fast HTML parser and only escalates to browser automation and AI-powered structured extraction when a page is dynamic, bot-protected, or poorly structured.

**Live demo**  
https://price-monitor.onlineeric.net/

## What this project demonstrates

- Full-stack application design with Next.js 16, React 19, TypeScript, PostgreSQL, Redis, and BullMQ
- Practical AI integration using the Vercel AI SDK with typed structured output, not just free-form prompting
- Background job orchestration for price checks, digest generation, and scheduler-managed repeatable jobs
- Browser automation with Playwright Extra and stealth mode for difficult e-commerce pages
- Production-oriented operations including Dockerized services, health endpoints, CI/CD, and self-hosted deployment

## Product capabilities

- Add a product URL and immediately enqueue an initial price check
- Manage products with create, edit, delete, active/inactive state, and manual re-check actions
- Browse monitored products in card or table views with recent price history
- Use global product search to quickly locate and edit products from anywhere in the dashboard
- Configure daily or weekly email digest schedules from the UI
- Trigger a full "check all products and send digest" run manually from the dashboard
- Track historical prices and compare current price vs last check and 7/30/90/180 day averages

## How the system works

```text
Next.js dashboard + API routes
        |
        v
BullMQ queue on Redis
        |
        v
Node worker
  - HTML fetch + Cheerio
  - Playwright + stealth
  - AI structured extraction fallback
        |
        v
PostgreSQL price history
        |
        v
Resend email digests
```

### End-to-end flow

1. A user adds a product URL in the web app.
2. The Next.js API stores the product and enqueues a `check-price` job.
3. The worker attempts extraction in tiers:
   - Tier 1: direct HTTP fetch plus Cheerio selectors
   - Tier 2: Playwright-rendered page plus selector extraction
   - Tier 3: AI extraction with typed Zod validation if selectors still fail
4. The latest result is stored in PostgreSQL as a new price record.
5. Scheduled or manual digest jobs fan out price checks for all active products, calculate trends, and send a summary email.

## AI extraction pipeline

This repository uses AI where it adds clear value: as a fallback for difficult pages, not as the default for every request.

- **Fast path:** `fetch()` + Cheerio handles simple product pages cheaply and quickly.
- **Rendered fallback:** Playwright loads JavaScript-heavy pages, waits for DOM stability, and retries extraction with browser-side selectors.
- **AI fallback:** Vercel AI SDK `generateObject()` extracts `title`, `price`, `currency`, and `imageUrl` into a strict Zod schema.
- **Provider flexibility:** OpenAI, Anthropic, and Google providers are switchable through environment variables.
- **Operational detail:** the worker reuses a singleton browser instance and exposes a health server for deployment checks.

## Tech stack

| Area | Technologies |
| --- | --- |
| Web app | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, Shadcn UI, Radix primitives, Sonner, Lucide |
| Forms and validation | React Hook Form, Zod |
| Data access | Drizzle ORM, PostgreSQL 18 |
| Queue and background jobs | BullMQ, Redis 8 |
| Extraction | Cheerio, Playwright, Playwright Extra, `puppeteer-extra-plugin-stealth` |
| AI | Vercel AI SDK, OpenAI, Anthropic, Google |
| Email | Resend, React Email |
| Testing | Vitest, Testing Library, jsdom |
| DevOps | Docker Compose, GitHub Actions, GHCR, Coolify |

## Engineering details worth noting

- **Worker-managed scheduling:** one worker instance owns BullMQ repeatable jobs, avoiding external cron dependencies.
- **Digest orchestration:** digest runs create child `check-price` jobs for each active product, then send the email after all checks complete.
- **Health monitoring:** the web app exposes `/api/health`, and the worker exposes its own `/health` endpoint plus a proxied web route.
- **Typed persistence:** products, price records, run logs, and settings are defined in a shared Drizzle schema package.
- **Recent UI improvements:** the dashboard includes shared product create/edit flows and global search for faster product management.

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
pnpm --filter @price-monitor/db push
pnpm worker:up
pnpm --filter @price-monitor/web dev
```

Open `http://localhost:3000/dashboard`.

### Development worker

If you want the worker in local watch mode instead of Docker:

```bash
pnpm --filter @price-monitor/worker exec playwright install chromium
pnpm dev:worker
```

`pnpm dev:worker` temporarily stops the background Docker worker, runs the worker with `tsx watch`, then restores the Docker worker when you exit.

## Deployment

Deployment is automated through GitHub Actions and Coolify.

- Pushes to `dev` build `web:dev` and `worker:dev` images for CI validation.
- Pushes to `main` build `web:latest` and `worker:latest`, push them to GHCR, and trigger Coolify webhooks.
- The production setup runs separate web and worker containers plus PostgreSQL and Redis.
- Only one production worker should have `ENABLE_SCHEDULER=true` to avoid duplicate scheduled emails.

## Repository structure

```text
apps/
  web/       Next.js dashboard and API routes
  worker/    BullMQ worker, extraction pipeline, scheduler, email jobs
packages/
  db/        Shared Drizzle schema and database client
docs/        Deployment and environment notes
specs/       Planning and implementation artifacts
scripts/     Local development and utility scripts
```

## Good entry points for technical review

- `apps/worker/src/services/scraper.ts`
- `apps/worker/src/services/playwrightFetcher.ts`
- `apps/worker/src/services/aiExtractor.ts`
- `apps/worker/src/jobs/sendDigest.ts`
- `apps/worker/src/scheduler.ts`
- `apps/web/src/app/api/products/route.ts`
- `apps/web/src/app/(main)/dashboard/products`
- `packages/db/src/schema.ts`
- `.github/workflows/build-and-push.yml`

## Additional documentation

- [Production environment reference](docs/production-env.md)
- [Docker troubleshooting](docs/troubleshooting-docker.md)
