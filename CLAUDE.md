# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Price Monitor AI Agent - monitors product prices from URLs, stores price history, and sends digest emails with trend analysis. Uses 2-tier extraction: HTML parsing → Playwright + AI fallback.

**Implementation Status:** Implementation 2 (Self-hosted Micro-PaaS)
**Spec-Driven Development:** See `specs/implementation-2/` for task specs

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
- **Database**: PostgreSQL 15 → **Coolify (Container)**
- **ORM**: **Drizzle ORM** (Serverless & Edge ready)
- **Redis**: **Redis 7** → **Coolify (Container)**
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
- **Local Dev**: Coolify on Multipass VM (Ubuntu 22.04)
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
  implementation-2/  # Current self-hosted approach
scripts/     # Utility scripts (redeploy-local, etc.)
```

---

## Commands

### Development
```bash
pnpm install                                  # Install all dependencies
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

### Local VM (Multipass)
```bash
multipass list                                # List VMs
multipass info coolify-local                  # Get VM IP and details
multipass shell coolify-local                 # SSH into VM
multipass start/stop coolify-local            # Start/stop VM
```

### Deployment
```bash
pnpm redeploy:local                           # Redeploy to local Coolify
# Production: Merge to main → Auto-deploy via GitHub Actions
```

---

## Environment Configuration

### Local Development (VM Services)

When developing locally with code on host machine:

1. **Start VM Services** (tasks 1.1-1.10):
   - PostgreSQL and Redis running in Coolify on local VM
   - Get VM IP: `multipass info coolify-local`

2. **Configure `.env`:**
   ```env
   DATABASE_URL="postgresql://postgres:password@<VM_IP>:5432/priceMonitor"
   REDIS_URL="redis://<VM_IP>:6379"
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

### Containerized Deployment (Local VM)

When deploying via Coolify on local VM:

1. **Environment Variables** set in Coolify dashboard for each app
2. **Database URLs** use Coolify internal DNS:
   ```
   postgresql://postgres:password@price-monitor-postgres:5432/priceMonitor
   redis://price-monitor-redis:6379
   ```
3. **Scheduler Enabled** for ONE worker instance:
   ```env
   ENABLE_SCHEDULER="true"
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

### Environment 1: Local Development
We first do fast iteration with hot reload:
1. Ensure local VM services running (PostgreSQL, Redis in Coolify)
2. Update `.env` with VM IP: `DATABASE_URL="postgresql://...@<VM_IP>:5432/..."`
3. Run: `pnpm --filter @price-monitor/web dev` and `pnpm --filter @price-monitor/worker dev`

### Environment 2: Test Containerized Locally
When merge into `dev` branch and ready for local deployment testing:
1. Push to `dev` branch → GitHub Actions builds `:dev` images
2. Run `pnpm redeploy:local` to deploy to local Coolify
3. Test at `http://<vm-ip>:8000` to verify the deployment

### Environment 3: Production Deployment
1. Create PR from `dev` to `main` or merge `dev` into `main`
2. GitHub Actions auto-builds `:latest` images
3. Coolify webhooks trigger production auto-deployment on DigitalOcean
4. Production auto-deploys on DigitalOcean

---

## Architecture

### Infrastructure Stack
| Component | Local VM | Production |
|-----------|----------|------------|
| **Orchestration** | Coolify (Multipass) | Coolify (DigitalOcean Sydney) |
| **PostgreSQL/Redis** | Containers on VM | Containers on Droplet |
| **Web/Worker** | GHCR `:dev` images | GHCR `:latest` images |
| **CICD** | Manual/CLI redeploy | Auto-deploy on `main` merge |

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

## Scheduling (Implementation 2 Change)

**Old:** Vercel Cron → `/api/cron/check-all` endpoint → Enqueue jobs
**New:** Worker-managed BullMQ Repeatable Jobs (reads from DB, polls every 5 mins)

**Benefits:** No external cron, no cold starts, scheduler controlled by `ENABLE_SCHEDULER=true` env var (set on ONE worker only)

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
- Local: VM IP-based URLs, `:dev` tags, manual redeploy
- Production: Coolify internal DNS, `:latest` tags, auto-deploy on merge

---

## Troubleshooting

### Local VM
- **VM won't start:** `multipass start coolify-local`
- **Can't access Coolify:** Get IP with `multipass info coolify-local`, access `http://<vm-ip>:8000`
- **DB connection failed:** Check containers in Coolify, verify `.env` URLs, test with `pnpm --filter @price-monitor/db push`

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
- Task specs in `specs/implementation-2/`
- Update specs first, then code

### Git Workflow
- **Manual commits only:** Make changes, then let user commit (don't commit yourself)
- Branch strategy: `feature/*` → `dev` → `main`

### Implementation Status
- **Phase 1:** Local VM + CICD - In Progress
- **Phase 2:** Production Deployment - Planned
- See `specs/implementation-2/task-overview.md` for roadmap
