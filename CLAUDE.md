# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Price Monitor AI Agent - monitors product prices from URLs, stores price history, and sends digest emails with trend analysis. Uses 2-tier extraction: HTML parsing → Playwright + AI fallback.

**Implementation Status:** Implementation 3 (Simplified Local Dev + Production)
**Spec-Driven Development:** See `specs/implementation-3/` for task specs

## Tech Stack

### Application
- **Frontend + API**: Next.js 16 (TypeScript) → **Coolify (Docker)**
  - UI Framework: Shadcn UI (Radix primitives)
  - Styling: Tailwind CSS v4
  - Forms: React Hook Form + Zod validation
  - Tables: TanStack Table
  - State: Zustand
  - Charts: Recharts
- **Background Worker**: Node.js (Docker) → **Coolify**
- **Authentication**: Public access (no authentication for demo purposes)

### Data & Messaging
- **Database**: PostgreSQL 18 → **docker-compose (Local)** / **Coolify (Production)**
- **ORM**: **Drizzle ORM** (Serverless & Edge ready)
- **Redis**: **Redis 8** → **docker-compose (Local)** / **Coolify (Production)**
- **Queue**: **BullMQ** (uses Redis)

### Extraction & AI
- **Web extraction**: HTTP fetch + **Playwright** with stealth mode
- **Bot detection bypass**: puppeteer-extra-plugin-stealth (~70-80% success rate)
- **AI SDK**: **Vercel AI SDK** (provider-agnostic abstraction)
- **AI Providers**: OpenAI, Google Gemini, Anthropic Claude (configurable via env)

### Email
- **Email service**: **Resend**
- **Templates**: **React Email**

### Infrastructure
- **Local Dev**: docker-compose on WSL2 Ubuntu
- **Production**: Coolify on DigitalOcean Droplet (Sydney region)
- **Container Registry**: GitHub Container Registry (GHCR)
- **CICD**: GitHub Actions

---

## Repository Structure

```
apps/
  web/       # Next.js app - Dashboard UI + API endpoints
  worker/    # BullMQ consumer - Extraction pipeline, DB writes, alerts
packages/
  db/        # Shared Drizzle schema and database client
specs/       # Architecture docs and task specs
  implementation-1/  # Original serverless approach (archived)
  implementation-2/  # VM-based approach (archived)
  implementation-3/  # Current simplified approach
scripts/     # Utility scripts
```

---

## Commands

### Development
```bash
pnpm install                                  # Install all dependencies
pnpm docker:up                                # Start PostgreSQL & Redis (docker-compose)
pnpm docker:down                              # Stop services
pnpm --filter @price-monitor/web dev          # Next.js dev server (port 3000)
pnpm --filter @price-monitor/worker dev       # Worker with hot reload
pnpm --filter @price-monitor/web build        # Production build
pnpm lint                                     # Lint (uses Biome)
```

### Database (Drizzle ORM)
```bash
pnpm --filter @price-monitor/db generate      # Generate migrations
pnpm --filter @price-monitor/db push          # Push schema to DB
pnpm --filter @price-monitor/db studio        # Open Drizzle Studio
```

### Docker Services
```bash
docker ps                                     # List running containers
docker logs price-monitoring-agent-postgres-1 # View PostgreSQL logs
docker logs price-monitoring-agent-redis-1    # View Redis logs
docker exec -it price-monitoring-agent-postgres-1 psql -U postgres -d priceMonitor  # Connect to DB
docker exec -it price-monitoring-agent-redis-1 redis-cli  # Connect to Redis
```

### Deployment
```bash
# Production: Merge to main → Auto-deploy via GitHub Actions
```

---

## Environment Configuration

### Local Development

Local development uses docker-compose for PostgreSQL and Redis:

1. **Start Services:**
   ```bash
   pnpm docker:up  # Starts PostgreSQL & Redis containers
   ```

2. **Configure `.env`:**
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/priceMonitor"
   REDIS_URL="redis://localhost:6379"
   AI_PROVIDER="anthropic"
   ANTHROPIC_API_KEY="your-key"
   RESEND_API_KEY="your-key"
   NODE_ENV="development"
   ENABLE_SCHEDULER="false"  # Not needed for local dev
   ```

3. **Run Apps:**
   ```bash
   pnpm --filter @price-monitor/web dev      # Port 3000
   pnpm --filter @price-monitor/worker dev   # Background
   ```

### Production Deployment

Production environment (DigitalOcean):

1. **Database URLs** use Coolify internal DNS:
   ```
   postgresql://postgres:password@price-monitor-postgres-prod:5432/priceMonitor
   redis://price-monitor-redis-prod:6379
   ```
2. **Environment Variables** set in production Coolify dashboard
3. **Scheduler**: Only ONE worker with `ENABLE_SCHEDULER="true"`
4. **Node Environment**: `NODE_ENV="production"`

---

## Development Workflow

### Local Development
Fast iteration with hot reload:
1. Start services: `pnpm docker:up`
2. Run apps: `pnpm --filter @price-monitor/web dev` and `pnpm --filter @price-monitor/worker dev`
3. Develop with hot reload
4. Stop services: `pnpm docker:down`

### Production Deployment
1. Create PR from `dev` to `main` or merge `dev` into `main`
2. GitHub Actions auto-builds `:latest` images
3. Coolify webhooks trigger production auto-deployment on DigitalOcean
4. Production auto-deploys on DigitalOcean

---

## Architecture

### Infrastructure Stack
| Component | Local Development | Production |
|-----------|-------------------|------------|
| **Orchestration** | docker-compose | Coolify (DigitalOcean Sydney) |
| **PostgreSQL/Redis** | docker-compose containers | Containers on Droplet |
| **Web/Worker** | Hot reload (pnpm dev) | GHCR `:latest` images |
| **CICD** | N/A | Auto-deploy on `main` merge |

### Key Endpoints
- `POST /api/debug/trigger` - Enqueue price check: `{ url: string }`
- Manual digest triggered via dashboard UI button
- Settings managed through dashboard (email schedule, etc.)

---

## Job Flow (BullMQ Queue)

**Manual Price Check:** API → `check-price` job → Worker extracts → Save to DB

**Manual Digest:** UI button → `send-digest` job → Worker spawns child `check-price` jobs → Calculates trends → Sends email

**Scheduled Digest:** Worker reads schedule from DB on startup → Registers BullMQ Repeatable Job → Auto-triggers on cron → Polls DB every 5 mins for schedule updates

---

## Scheduling

Worker-managed BullMQ Repeatable Jobs (reads from DB, polls every 5 mins)

**Benefits:** No external cron, no cold starts, scheduler controlled by `ENABLE_SCHEDULER=true` env var (set on ONE worker only in production)

---

## Extraction Pipeline (2-Tier Fallback)

**Tier 1: HTML Fetcher** (~100-500ms, free)
- Native fetch + Cheerio + selector-based extraction

**Tier 2: Playwright + AI** (~3-6s, $0.001-0.01)
- Chromium with stealth mode (playwright-extra + puppeteer-extra-plugin-stealth)
- Bypasses ~70-80% bot detection, singleton browser instance
- Tries selectors on rendered HTML first
- Falls back to AI (Vercel AI SDK) with Zod validation if selectors fail
- Supports OpenAI, Google, Anthropic (configurable via `AI_PROVIDER`)

**Debug:** `FORCE_AI_EXTRACTION=true` to skip Tier 1

---

## Data Model (Drizzle ORM)

- **products**: URL (unique key), name, imageUrl, active, last success/failure timestamps
- **priceRecords**: productId (FK cascade), price (cents), currency, scrapedAt
- **settings**: Key-value store (email schedule)
- **runLogs**: Job status/error tracking

**Important:** Products auto-created on first check using URL as natural key (`ON CONFLICT DO NOTHING`). Prices in cents to avoid floating-point issues.

---

## Key Implementation Details

### Worker Architecture
- **Singleton Browser**: Playwright instance reused across jobs
- **Graceful Shutdown**: SIGTERM/SIGINT cleanup
- **Hot Reload**: `tsx watch` in dev mode
- **Scheduler**: Only ONE worker with `ENABLE_SCHEDULER=true`

### Price Parser
Multi-currency support (USD, EUR, GBP, JPY), handles European vs US formats (€1.234,56 vs $1,234.56)

### Queue Config
Queue: `price-monitor-queue`, Job data: `{ url: string }`, Redis shared between web/worker

---

## Production Deployment

**Platform:** DigitalOcean Droplet (Sydney), Coolify orchestration, GHCR `:latest` images

**Auto-Deploy:** Merge to `main` → GitHub Actions builds → Triggers Coolify webhooks → Redeploys

**Environment (Coolify dashboard):**
```env
DATABASE_URL="postgresql://postgres:...@price-monitor-postgres-prod:5432/priceMonitor"  # Internal DNS
REDIS_URL="redis://price-monitor-redis-prod:6379"
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="..."
RESEND_API_KEY="..."
ENABLE_SCHEDULER="true"  # ONLY on ONE worker
NODE_ENV="production"
```

**Local vs Production:**
- Local: localhost URLs, hot reload via pnpm dev
- Production: Coolify internal DNS, `:latest` tags, auto-deploy on merge

---

## Troubleshooting

### Local Development
- **Services won't start:** Run `pnpm docker:up`, check Docker Desktop is running
- **Connection refused:** Verify `.env` has `localhost` URLs (not VM IP)
- **DB connection failed:**
  - Check containers: `docker ps | grep price-monitoring`
  - View logs: `docker logs price-monitoring-agent-postgres-1`
  - Test connection: `pnpm --filter @price-monitor/db push`
- **Port already in use:** Stop existing containers: `pnpm docker:down`

### Production
- **Deployment failed:** Check GitHub Actions logs → Coolify logs → env vars
- **App won't start:** Check Coolify logs, verify env vars, check DB connectivity, verify `:latest` tag
- **Worker not processing:** Check worker logs, verify Redis connection, check `ENABLE_SCHEDULER`
- **Scheduled emails not sending:** Verify `ENABLE_SCHEDULER=true`, check worker logs for "Scheduler started", verify RESEND_API_KEY

### CICD
- **GitHub Actions failing:** Check workflow syntax, test Docker builds locally, verify GHCR auth
- **Webhooks not triggering:** Verify GitHub Secrets set, check webhook URLs, test with curl
- **Images not updating:** Verify push to GHCR, check tag, manually redeploy in Coolify

---

## Important Notes

### Spec-Driven Development
- Task specs in `specs/implementation-3/`
- Update specs first, then code

### Git Workflow
- **Manual commits only:** Make changes, then let user commit (don't commit yourself)
- Branch strategy: `feature/*` → `dev` → `main`

### Implementation Status

- **Phase 1:** Local Development Simplification - In Progress
- **Phase 2:** Production Deployment - Planned
- See `specs/implementation-3/task-overview.md` for roadmap
