# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

AI-powered price monitoring system that tracks product prices from URLs, stores price history, and sends automated email digests with trend analysis.

**Key Features:**
- 2-tier extraction pipeline (HTML parsing → Playwright + AI fallback)
- Worker-managed scheduling with BullMQ
- Automated CI/CD deployment to production
- Historical price tracking and trend analysis

---

## Tech Stack

**Frontend + API:** Next.js 16 (TypeScript), Shadcn UI, Tailwind CSS v4, React Hook Form, TanStack Table

**Background Worker:** Node.js, BullMQ (Redis queue)

**Browser Automation:** Playwright with stealth mode

**AI Integration:** Vercel AI SDK (supports OpenAI, Anthropic, Google)

**Data:** PostgreSQL 18 (Drizzle ORM), Redis 8

**Email:** Resend + React Email

**Infrastructure:** Docker Compose (local), Coolify on DigitalOcean (production), GitHub Actions (CI/CD)

---

## Repository Structure

```
apps/
  web/       # Next.js app - Dashboard UI + API endpoints
  worker/    # BullMQ consumer - Extraction pipeline, DB writes, email alerts
packages/
  db/        # Shared Drizzle schema and database client
specs/       # Architecture documentation
scripts/     # Utility scripts
```

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start PostgreSQL & Redis (Docker Compose)
pnpm docker:up

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
pnpm --filter @price-monitor/db push

# Start apps (two terminals)
pnpm --filter @price-monitor/web dev      # Terminal 1 (port 3000)
pnpm --filter @price-monitor/worker dev   # Terminal 2
```

---

## Essential Commands

### Development
```bash
pnpm docker:up                            # Start PostgreSQL & Redis
pnpm docker:down                          # Stop services
pnpm --filter @price-monitor/web dev      # Next.js dev server
pnpm dev:worker                           # Dev worker (auto-stops/restarts Docker worker)
pnpm lint                                 # Lint with Biome
```

### Background Docker Worker
```bash
pnpm worker:up                            # Start/rebuild background worker
pnpm worker:down                          # Stop background worker
pnpm worker:logs                          # View worker logs
pnpm worker:restart                       # Restart background worker
```

The Docker worker uses `profiles: ["worker"]` so `pnpm docker:up` only starts PostgreSQL and Redis. The worker auto-restarts with Docker Desktop. `pnpm dev:worker` automatically stops the Docker worker, runs the dev worker, and restarts Docker worker on exit (Ctrl+C).

### Database
```bash
pnpm --filter @price-monitor/db generate  # Generate migrations
pnpm --filter @price-monitor/db push      # Push schema to DB
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio
```

### Docker Services
```bash
docker ps                                                     # List containers
docker logs price-monitoring-agent-postgres-1                 # PostgreSQL logs
docker logs price-monitoring-agent-redis-1                    # Redis logs
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor
docker exec -it price-monitoring-agent-redis-1 redis-cli
```

---

## Architecture

### Local Development
```
WSL Ubuntu
├── Web App (pnpm dev, port 3000)
├── Worker (Docker background OR pnpm dev for development)
└── Docker Compose
    ├── PostgreSQL 18 (port 5432)
    ├── Redis 8 (port 6379)
    └── Worker (profile: worker, auto-starts with Docker Desktop)
```

**Environment:**
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
REDIS_URL="redis://localhost:6379"
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="your-key"
RESEND_API_KEY="your-key"
NODE_ENV="development"
```

### Production
```
DigitalOcean Droplet (Sydney)
├── Coolify (orchestration)
├── Web (GHCR :latest image)
├── Worker (GHCR :latest image)
├── PostgreSQL (container)
└── Redis (container)
```

**Deployment:** Push to `main` → GitHub Actions builds → GHCR → Coolify auto-deploys

**Environment:** Internal DNS (`price-monitor-postgres-prod`, `price-monitor-redis-prod`), `ENABLE_SCHEDULER=true` on ONE worker only

---

## Extraction Pipeline (2-Tier Fallback)

**Tier 1: HTML Fetcher** (~100-500ms, free)
- HTTP fetch + Cheerio + selector-based extraction
- Fast for standard e-commerce sites

**Tier 2: Playwright + AI** (~3-6s, $0.001-0.01)
- Headless Chromium with stealth mode (puppeteer-extra-plugin-stealth)
- Bypasses ~70-80% bot detection
- Singleton browser instance (reused across jobs)
- Tries selectors on rendered HTML first
- Falls back to AI with Zod validation if selectors fail
- Configurable provider: OpenAI, Anthropic, Google (`AI_PROVIDER` env var)

**Debug:** Set `FORCE_AI_EXTRACTION=true` to skip Tier 1

---

## Data Model (Drizzle ORM)

**products:** URL (unique key), name, imageUrl, active, success/failure timestamps

**priceRecords:** productId (FK cascade), price (cents), currency, scrapedAt

**settings:** Key-value store (email schedule, etc.)

**runLogs:** Job status/error tracking

**Note:** Products auto-created on first check using URL as natural key. Prices stored in cents to avoid floating-point issues.

---

## Job Flow (BullMQ)

**Manual Price Check:**
```
API → check-price job → Worker extracts → Save to DB
```

**Manual Digest:**
```
UI button → send-digest job → Worker spawns check-price jobs → Calculate trends → Send email
```

**Scheduled Digest:**
```
Worker startup → Read schedule from DB → Register BullMQ Repeatable Job → Auto-trigger on cron
```

Worker polls DB every 5 minutes for schedule updates. No external cron needed, no cold starts.

---

## Key Implementation Details

### Worker Architecture
- **Singleton Browser:** Playwright instance reused across jobs for performance
- **Graceful Shutdown:** SIGTERM/SIGINT cleanup handlers
- **Hot Reload:** `tsx watch` in dev mode
- **Scheduler:** Only ONE worker with `ENABLE_SCHEDULER=true` in production

### Price Parser
Multi-currency support (USD, EUR, GBP, JPY), handles European vs US number formats (€1.234,56 vs $1,234.56)

### Queue Config
Queue name: `price-monitor-queue`, Job data: `{ url: string }`, Redis shared between web/worker

---

## Troubleshooting

### Local Development

**Services won't start:**
```bash
docker ps                                         # Verify Docker running
pnpm docker:up                                    # Start services
docker logs price-monitoring-agent-postgres-1     # Check logs
```

**Port conflicts (5432/6379):**
```bash
sudo lsof -i :5432                                # Check port usage
# Stop conflicting service or change ports in docker-compose.yml
```

**Connection failed:**
- Verify `.env` uses `localhost` URLs
- Check containers: `docker ps`
- Test connection: `pnpm --filter @price-monitor/db push`

### Production

**Check logs:** Coolify dashboard → Application → Logs tab

**Common issues:**
- Deployment failed: Check GitHub Actions logs
- App won't start: Verify environment variables in Coolify
- Worker not processing: Check Redis connection and `ENABLE_SCHEDULER` setting
- Webhooks not triggering: Verify GitHub Secrets (`COOLIFY_WEBHOOK_WEB_PROD`, `COOLIFY_WEBHOOK_WORKER_PROD`)

---

## Git Workflow

**Branches:** `feature/*` → `dev` → `main`

**Deployment:** Merge to `main` triggers auto-deployment to production

**Note:** Only create commits when explicitly requested by user

---

## Additional Documentation

- **README.md** - Getting started guide
- **specs/implementation-3/** - Architecture and task specifications
- **docs/production-env.md** - Production environment variables reference
