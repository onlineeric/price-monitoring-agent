# Price Monitor AI Agent

AI-powered price monitoring system that tracks product prices over time with intelligent extraction, trend analysis, and automated email digests.

**Purpose:** Portfolio project demonstrating full-stack development, background job processing, AI integration, and production deployment skills.

**Live Demo:** https://price-monitor.onlineeric.net/dashboard

## Technical Highlights

### 2-Tier Intelligent Extraction Pipeline

**Tier 1: Fast HTML Parser** (~100-500ms, free)

- Static HTML parsing with Cheerio
- Multiple selector fallbacks
- Instant results for standard e-commerce sites

**Tier 2: AI-Powered Browser Automation** (~3-6s)

- Headless Chromium with stealth mode (puppeteer-extra-plugin-stealth)
- Bypasses bot detection (~70-80% success rate)
- AI fallback for complex pages using Vercel AI SDK
- Structured output validation with Zod
- Multi-provider support (OpenAI, Anthropic, Google)

### Worker-Managed Scheduling

- **BullMQ Repeatable Jobs** - No external cron dependencies
- **Dynamic schedule updates** - Detects changes within 5 minutes
- **Always-on processing** - No cold starts
- **Trend analysis** - Calculates 7/30/90/180 day price averages

### Production-Ready CI/CD

```text
Developer → GitHub → GitHub Actions
                         ↓
             GitHub Container Registry
                         ↓
             Coolify (DigitalOcean)
                         ↓
       Web + Worker + PostgreSQL + Redis
            (Auto-deployment)
```

Fully automated deployment pipeline from code push to production with zero manual intervention.

## Tech Stack

### Frontend & Backend

Built on [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard), an MIT-licensed Next.js admin template.

- **Framework:** Next.js 16 (React 19, TypeScript)
- **UI Components:** Shadcn UI (Radix primitives) + Tailwind CSS v4
- **Forms:** React Hook Form + Zod validation
- **Data Tables:** TanStack Table
- **State Management:** Zustand
- **Charts:** Recharts

### Background Processing

- **Queue:** BullMQ (Redis-backed)
- **Browser Automation:** Playwright with stealth mode
- **AI Integration:** Vercel AI SDK (multi-provider: OpenAI, Anthropic, Google)

### Data Layer

- **Database:** PostgreSQL 18
- **ORM:** Drizzle ORM (serverless-ready)
- **Cache/Queue:** Redis 8

### Infrastructure

- **Local Dev:** Docker Compose on WSL2
- **Production:** Coolify (self-hosted PaaS on DigitalOcean Sydney)
- **Container Registry:** GitHub Container Registry (GHCR)
- **CI/CD:** GitHub Actions (auto-build + auto-deploy)

### Communication

- **Email Service:** Resend
- **Email Templates:** React Email

## Key Features

- **Price Tracking** - Monitor products from any URL with historical price data
- **Smart Extraction** - 2-tier fallback system (fast HTML → AI-powered browser automation)
- **Automated Digests** - Scheduled email reports with trend analysis (7/30/90/180 day averages)
- **Professional Dashboard** - Modern UI for product management and price analytics
- **Production Deployment** - Automated CI/CD pipeline with zero-downtime deployments

## Architecture

### Local Development

```text
WSL2 Ubuntu
├── Web App (Next.js dev server, port 3000)
├── Worker (Docker background OR dev mode with hot reload)
└── Docker Compose
    ├── PostgreSQL 18
    ├── Redis 8
    └── Worker (optional, auto-starts with Docker Desktop)
```

Docker worker runs as a persistent background service. When developing, `pnpm dev:worker` automatically swaps to the dev worker and restores the Docker worker on exit.

### Production

```text
DigitalOcean Droplet (Sydney)
├── Coolify (orchestration)
├── Web (containerized Next.js)
├── Worker (containerized Node.js)
├── PostgreSQL (container)
└── Redis (container)
```

Self-hosted PaaS deployment with automated updates via GitHub Actions webhooks.

## Quick Start

**Prerequisites:** Node.js 20+, pnpm, Docker

```bash
# Install dependencies
pnpm install

# Install Playwright browser
pnpm --filter @price-monitor/worker exec playwright install chromium

# Start database services
pnpm docker:up

# Configure environment
cp .env.example .env
# Edit .env with your API keys (ANTHROPIC_API_KEY, RESEND_API_KEY)

# Initialize database
pnpm --filter @price-monitor/db push

# Start background worker (one-time setup, auto-restarts with Docker Desktop)
pnpm worker:up

# Start web app
pnpm --filter @price-monitor/web dev      # http://localhost:3000

# For development: swap Docker worker with dev worker (auto-restores on Ctrl+C)
pnpm dev:worker
```

Visit `http://localhost:3000` to access the dashboard.

## Deployment

Production deployment is fully automated:

1. **Develop** - Work on feature branches, merge to `dev` for testing
2. **Release** - Create PR from `dev` to `main`, review, and merge
3. **Build** - GitHub Actions automatically builds Docker images
4. **Push** - Images pushed to GitHub Container Registry (GHCR)
5. **Deploy** - Coolify webhook triggers auto-deployment to production

Zero manual intervention required. Push to `main` and your code is live.

## Project Structure

```text
apps/
  web/       # Next.js application (dashboard + API endpoints)
  worker/    # BullMQ consumer (extraction, email, scheduling)
packages/
  db/        # Shared Drizzle schema and database client
specs/       # Architecture documentation
scripts/     # Utility scripts
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Development guide and reference
- **[docs/production-env.md](docs/production-env.md)** - Production environment configuration
- **[specs/implementation-3/](specs/implementation-3/)** - Architecture and implementation specifications

## Skills Demonstrated

- **Full-Stack Development** - Next.js, TypeScript, React, API design
- **Background Jobs** - BullMQ queue system with worker-managed scheduling
- **AI Integration** - Multi-provider AI SDK with structured output validation
- **Browser Automation** - Playwright with stealth mode for bot detection bypass
- **Database Design** - PostgreSQL with Drizzle ORM, efficient schema design
- **DevOps** - Docker, Docker Compose, self-hosted PaaS deployment
- **CI/CD** - GitHub Actions, automated builds and deployments
- **Production Operations** - Monitoring, logging, zero-downtime deployments
