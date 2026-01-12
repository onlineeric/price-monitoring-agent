# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Price Monitor AI Agent - a system that monitors product prices from URLs, stores price history, and sends digest emails with trend analysis. Uses traditional web extraction with AI fallback for complex pages.

**Implementation Status:** Implementation 2 (Self-hosted Micro-PaaS)

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

### Root (pnpm workspaces)
```bash
pnpm install              # Install all dependencies
```

### Web App (apps/web)
```bash
pnpm --filter @price-monitor/web dev      # Start Next.js dev server (local)
pnpm --filter @price-monitor/web build    # Production build
pnpm --filter @price-monitor/web lint     # Run ESLint
```

### Worker (apps/worker)
```bash
pnpm --filter @price-monitor/worker dev   # Run worker with hot reload (local)
```

### Database (packages/db)
```bash
pnpm --filter @price-monitor/db generate  # Generate Drizzle migrations
pnpm --filter @price-monitor/db push      # Push schema to database
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio
```

### Local VM Management
```bash
multipass list                            # List all VMs
multipass info coolify-local              # Get VM details (IP, resources)
multipass shell coolify-local             # SSH into VM
multipass stop coolify-local              # Stop VM
multipass start coolify-local             # Start VM
```

### Local Deployment
```bash
pnpm redeploy:local                       # Trigger redeploy on local Coolify
```

### Docker (Local Testing)
```bash
# Build images locally
docker build -f apps/web/Dockerfile -t web:test .
docker build -f apps/worker/Dockerfile -t worker:test .

# Run containers locally
docker run -p 3000:3000 --env-file .env web:test
docker run --env-file .env worker:test
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

### Option 1: Local Code + VM Services (Recommended for development)

**Use Case:** Fast iteration with hot reload

1. Ensure VM services running (PostgreSQL, Redis)
2. Update `.env` with VM connection strings
3. Run apps locally:
   ```bash
   pnpm --filter @price-monitor/web dev      # Port 3000
   pnpm --filter @price-monitor/worker dev   # Background
   ```
4. Code changes auto-reload

### Option 2: Full Containerized (Recommended for testing)

**Use Case:** Test deployment before production

1. Push code to `dev` branch
2. GitHub Actions builds `:dev` images
3. Redeploy on local Coolify:
   ```bash
   pnpm redeploy:local
   ```
4. Test containerized apps

### Option 3: Production Deployment

**Use Case:** Deploy to production

1. Develop and test on `dev` branch with local VM
2. Create PR from `dev` to `main`
3. Review and merge PR
4. GitHub Actions automatically:
   - Builds `:latest` images
   - Pushes to GHCR
   - Triggers Coolify webhooks
   - Coolify pulls and redeploys
5. Monitor production logs and verify

---

## Architecture (Implementation 2)

### Infrastructure

| Component | Local VM | Production |
|-----------|----------|------------|
| **Orchestration** | Coolify on Multipass VM | Coolify on DigitalOcean |
| **PostgreSQL** | Container on VM | Container on Droplet |
| **Redis** | Container on VM | Container on Droplet |
| **Web App** | Container from GHCR `:dev` | Container from GHCR `:latest` |
| **Worker** | Container from GHCR `:dev` | Container from GHCR `:latest` |
| **CICD** | GitHub Actions → GHCR | GitHub Actions → GHCR → Coolify |

### API Endpoints

**POST /api/debug/trigger**
- Enqueues a price check job by URL
- Body: `{ url: string }`
- Returns: `{ success: boolean, jobId: string }`

**Manual Digest** (via UI button)
- Triggers digest email for all active products
- No direct API endpoint (handled via UI action)

**Settings API** (for email schedule configuration)
- Managed through dashboard settings page

---

## Job Flow

### A. Manual Price Check (Single Product)
1. User sends URL to debug endpoint: `POST /api/debug/trigger`
2. API enqueues a `check-price` job to BullMQ
3. Worker extracts price using 2-tier fallback pipeline
4. Worker saves price record to database

### B. Manual Digest (All Products + Email)
1. User clicks "Check All & Send Email" button on dashboard
2. API enqueues a `send-digest` job to BullMQ
3. Worker creates parent-child job flow
4. Child jobs: one `check-price` job per active product
5. Worker waits for all jobs, calculates trends, sends digest email

### C. Scheduled Digest (Automated)
1. Worker reads email schedule settings from database on startup
2. Worker registers BullMQ Repeatable Job with cron pattern
3. BullMQ automatically triggers `send-digest` job on schedule
4. Worker processes job (same as manual digest)
5. Worker polls database every 5 minutes for schedule changes

---

## Scheduling Architecture

**Old (Implementation 1):**
```
Vercel Cron (every 30 mins)
    ↓
GET /api/cron/check-all
    ↓
API checks schedule settings
    ↓
Enqueues jobs to BullMQ
```

**New (Implementation 2):**
```
Worker starts
    ↓
Reads email schedule settings from PostgreSQL
    ↓
Registers BullMQ Repeatable Job with cron pattern
    ↓
BullMQ automatically triggers jobs on schedule
    ↓
(Settings change in UI → Worker polls → Updates repeatable job)
```

**Benefits:**
- No external cron dependency
- Worker is always running (no cold start)
- Schedule changes take effect within 5 minutes
- Single scheduler-enabled worker prevents duplicate jobs

---

## Extraction Pipeline (2-Tier Fallback)

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

---

## Data Model

- **products**: URL (unique, natural key), name, imageUrl, active flag, last success/failure timestamps
- **priceRecords**: productId (FK cascade delete), price (in cents), currency, scrapedAt
- **settings**: Key-value store for global configuration (email schedule, etc.)
- **runLogs**: Status and error tracking for debugging

Products are auto-created on first price check using URL as the natural key. All prices stored in cents to avoid floating-point precision issues.

---

## Key Implementation Details

### Product Auto-Creation
Products are automatically created when a price check job is submitted with a URL. The system uses URL as a natural key with `ON CONFLICT DO NOTHING` to ensure idempotent upserts.

### Worker Architecture
- **Singleton Browser**: Playwright browser instance is reused across jobs for efficiency
- **Graceful Shutdown**: Worker handles SIGTERM/SIGINT with proper cleanup
- **Hot Reload**: Development mode uses tsx watch for automatic restarts
- **Stealth Mode**: Uses playwright-extra + puppeteer-extra-plugin-stealth to bypass bot detection
- **Scheduler**: BullMQ Repeatable Jobs managed by worker (single instance with ENABLE_SCHEDULER=true)

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

---

## Production Deployment

### Infrastructure

**Platform:** DigitalOcean Droplet (Sydney region)
**Orchestration:** Coolify (self-hosted)
**Containers:** Pulled from GHCR (`:latest` tag)

### Deployment Process

**Automatic Deployment (Recommended):**
1. Develop and test on `dev` branch with local VM
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

Production apps environment variables set in Coolify dashboard:

```env
# Database (Coolify internal DNS)
DATABASE_URL="postgresql://postgres:<password>@price-monitor-postgres-prod:5432/priceMonitor"

# Redis (Coolify internal DNS)
REDIS_URL="redis://price-monitor-redis-prod:6379"

# AI Provider
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="<your-key>"
ANTHROPIC_MODEL="claude-haiku-4-5"

# Email
RESEND_API_KEY="<your-key>"

# Worker Scheduler (IMPORTANT: Only ONE worker should have this)
ENABLE_SCHEDULER="true"

# Environment
NODE_ENV="production"
```

See `docs/production-env.md` for complete environment variable documentation.

### Production vs Local Differences

| Aspect | Local VM | Production |
|--------|----------|------------|
| **Location** | Multipass VM on dev machine | DigitalOcean Droplet (Sydney) |
| **Access** | `http://<vm-ip>:8000` | `http://<droplet-ip>:8000` |
| **Database URLs** | VM IP-based | Coolify internal DNS |
| **Deployment** | Manual trigger or CLI script | Automatic on `main` merge |
| **Images** | `:dev` tag | `:latest` tag |
| **SSL** | No (HTTP only) | Optional (can add domain + SSL) |
| **Cost** | Free (local resources) | ~$24/month |

---

## Troubleshooting

### Local VM Issues

**VM won't start:**
```bash
multipass list  # Check VM status
multipass start coolify-local
```

**Can't access Coolify dashboard:**
- Verify VM IP: `multipass info coolify-local`
- Check firewall: VM should allow port 8000
- Try: `http://<vm-ip>:8000`

**Database connection failed:**
- Verify containers running in Coolify
- Check connection string in `.env`
- Test: `pnpm --filter @price-monitor/db push`

### Production Issues

**Deployment failed:**
1. Check GitHub Actions logs
2. Verify Docker image built successfully
3. Check Coolify deployment logs
4. Verify environment variables set

**Application won't start:**
1. Check logs in Coolify
2. Verify environment variables
3. Check database connectivity
4. Verify image tag is correct (`:latest`)

**Worker not processing jobs:**
1. Check worker logs for errors
2. Verify Redis connection
3. Check `ENABLE_SCHEDULER` setting
4. Verify BullMQ connection in logs

**Scheduled emails not sending:**
1. Check worker logs for "Scheduler started"
2. Verify `ENABLE_SCHEDULER=true`
3. Check email schedule settings in DB
4. Verify RESEND_API_KEY is set
5. Check worker logs for cron pattern

### CICD Issues

**GitHub Actions failing:**
1. Check workflow file syntax
2. Verify Docker builds locally
3. Check GHCR authentication
4. Review Actions logs for specific error

**Webhooks not triggering:**
1. Verify GitHub Secrets are set
2. Check webhook URLs are correct
3. Test webhook manually with curl
4. Check Coolify logs for webhook received

**Images not updating:**
1. Verify image pushed to GHCR
2. Check image tag is correct
3. Manually trigger redeploy in Coolify
4. Clear image cache if needed

---

## Development Workflow

This project follows **Spec-Driven Development**. Task specifications are in the `specs/implementation-2/` folder.

### Git Commit Conventions

Commit messages use task tags that match spec documents:

- **Single task**: `[task-1.11] create web app dockerfile`
- **Multiple tasks**: `[task-1.11-1.19] implement local VM CICD`
- **No task**: `[misc] minor cleanup`

Tag format: `[task-X.Y]` corresponds to `specs/implementation-2/task-X.Y.md`.

---

## Implementation Status

**Current Status:** Implementation 2 (Self-hosted Micro-PaaS)

See `specs/implementation-2/task-overview.md` for full roadmap and `specs/implementation-2/task-*.md` for detailed task specs.

**Phase 1:** Local VM + CICD - In Progress
**Phase 2:** Production Deployment - Planned
