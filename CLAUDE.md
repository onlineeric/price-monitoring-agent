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
- **Database**: PostgreSQL 18 → **Docker Compose (Local)** / **Coolify (Production)**
- **ORM**: **Drizzle ORM** (Serverless & Edge ready)
- **Redis**: **Redis 8** → **Docker Compose (Local)** / **Coolify (Production)**
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
- **Local Dev**: Docker Compose (v2 `docker compose`) on WSL2 Ubuntu
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
pnpm docker:up                                # Start PostgreSQL & Redis (Docker Compose)
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

Local development uses Docker Compose (v2 `docker compose`) for PostgreSQL and Redis:

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
| **Orchestration** | Docker Compose | Coolify (DigitalOcean Sydney) |
| **PostgreSQL/Redis** | Docker Compose containers | Containers on Droplet |
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

### Infrastructure

**Platform:** DigitalOcean Droplet (Sydney region)
**Orchestration:** Coolify (self-hosted)
**Containers:** Pulled from GHCR (`:latest` tag)

### Deployment Process

**Automatic Deployment (Recommended):**
1. Develop and test on `dev` branch locally (Docker Compose services)
2. Create PR from `dev` to `main`
3. Review and merge PR
4. GitHub Actions automatically:
   - Builds `:latest` images
   - Pushes to GHCR
   - Triggers Coolify webhooks
   - Coolify pulls and redeploys

**Manual Deployment (if needed):**
1. Access production Coolify: `http://<droplet-ip>:8000`
2. Navigate to application
3. Click "Redeploy"

### Environment Configuration

**Production Apps Environment Variables:**
Set in Coolify dashboard for each app:

```env
# Database (Coolify internal DNS)
DATABASE_URL="postgresql://postgres:<password>@price-monitor-postgres-prod:5432/priceMonitor"

# Redis (Coolify internal DNS)
REDIS_URL="redis://price-monitor-redis-prod:6379"

# AI Provider
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="<your-key>"

# Email
RESEND_API_KEY="<your-key>"

# Worker Scheduler (IMPORTANT: Only ONE worker should have this)
ENABLE_SCHEDULER="true"

# Environment
NODE_ENV="production"
```

### Production vs Local Differences

| Aspect | Local Development | Production |
|--------|-------------------|------------|
| **Location** | Developer machine (apps run on host) | DigitalOcean Droplet (Sydney) |
| **Access** | Web: `http://localhost:3000` | Web: `http://<production-ip>` |
| **Services** | Postgres/Redis via Docker Compose | Postgres/Redis via Coolify-managed containers |
| **Database URLs** | `localhost` ports | Coolify internal DNS |
| **Deployment** | `pnpm dev` + `pnpm docker:up` | Automatic on `main` merge |
| **Images** | N/A (not containerized locally) | `:latest` tag |
| **SSL** | No (HTTP only) | Optional (domain + SSL) |

### Monitoring

**Logs:**
- Production Coolify → Application → Logs tab
- Real-time log streaming
- Filter by severity

**Resource Usage:**
- Coolify dashboard shows CPU, memory, disk usage
- Monitor for spikes or issues

**Health Checks:**
- Web app: Access production URL, verify dashboard loads
- Worker: Check logs for "Connected to Redis" message
- Database: Query record count to verify data

---

## Troubleshooting

### Local Development Issues (Docker Compose)

**Docker services won't start:**
- Verify Docker is running: `docker ps`
- Start services: `pnpm docker:up`
- Check logs: `docker logs price-monitoring-agent-postgres-1`

**Port conflicts (5432 / 6379):**
- Check what's using the port: `sudo lsof -i :5432` or `sudo lsof -i :6379`
- Stop the conflicting service or change ports in `docker-compose.yml`

**Database connection failed:**
- Verify `.env` uses `localhost` URLs (not old VM IP)
- Verify containers are healthy: `docker ps`
- Test connection: `pnpm --filter @price-monitor/db push`

**Connection refused:**
- Check containers are running: `docker ps | grep price-monitoring`
- View container logs: `docker logs price-monitoring-agent-postgres-1`

### Production Issues

**Deployment failed:**
1. Check GitHub Actions logs for build errors
2. Verify Docker image built successfully
3. Check Coolify deployment logs
4. Verify environment variables are set correctly

**Application won't start:**
1. Check logs in Coolify dashboard
2. Verify all environment variables are set
3. Check database connectivity (internal DNS names)
4. Verify image tag is correct (`:latest`)

**Worker not processing jobs:**
1. Check worker logs for errors
2. Verify Redis connection is working
3. Check `ENABLE_SCHEDULER` setting
4. Verify BullMQ connection in logs

**Scheduled emails not sending:**
1. Check worker logs for "Scheduler started" message
2. Verify `ENABLE_SCHEDULER=true` on ONE worker only
3. Check email schedule settings in database
4. Verify RESEND_API_KEY is set correctly
5. Check worker logs for cron pattern registration

### CICD Issues

**GitHub Actions failing:**
1. Check workflow file syntax (YAML validation)
2. Verify Docker builds work locally
3. Check GHCR authentication (GITHUB_TOKEN)
4. Review Actions logs for specific error messages

**Webhooks not triggering:**
1. Verify GitHub Secrets are set:
   - `COOLIFY_WEBHOOK_WEB_PROD`
   - `COOLIFY_WEBHOOK_WORKER_PROD`
2. Check webhook URLs are correct (from Coolify)
3. Test webhook manually with curl
4. Check Coolify logs for webhook received

**Images not updating in production:**
1. Verify image was pushed to GHCR successfully
2. Check image tag is correct (`:latest`)
3. Manually trigger redeploy in Coolify
4. Clear image cache if needed

---

## Important Notes

### Spec-Driven Development
- Task specs in `specs/implementation-3/`
- Update specs first, then code

### Git Workflow
- **Manual commits only:** Make changes, then let user commit (don't commit yourself)
- Branch strategy: `feature/*` → `dev` → `main`

### Implementation Status

- **Phase 1:** Local Development Simplification - Complete
- **Phase 2:** Production Deployment - In Progress
- See `specs/implementation-3/task-overview.md` for roadmap
- See `docs/production-env.md` for production environment variables guide
