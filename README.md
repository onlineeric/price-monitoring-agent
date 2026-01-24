# Price Monitor AI Agent

AI-powered price monitoring system that tracks product prices over time with intelligent extraction, trend analysis, and automated email digests.

**Purpose:** Portfolio project demonstrating full-stack development, background job processing, AI integration, and production deployment skills.

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

### Worker-Managed Scheduling

- **BullMQ Repeatable Jobs** - No external cron dependencies
- **Dynamic schedule updates** - Detects changes within 5 minutes
- **Always-on processing** - No cold starts
- **Trend analysis** - Calculates 7/30/90/180 day price averages

### Production-Ready Architecture

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

## Tech Stack

### Frontend & Backend

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
- **Production:** Coolify (self-hosted PaaS on DigitalOcean)
- **Container Registry:** GitHub Container Registry (GHCR)
- **CI/CD:** GitHub Actions (auto-build + auto-deploy)

### Communication

- **Email Service:** Resend
- **Email Templates:** React Email

## Key Features

- **Price Tracking:** Monitor products from any URL with historical price data
- **Smart Extraction:** 2-tier fallback (fast HTML → AI-powered browser automation)
- **Automated Digests:** Scheduled email reports with trend analysis
- **Dashboard:** Professional UI for product management and analytics
- **Production Deployment:** Automated CI/CD pipeline with zero-downtime deployments

## Architecture

### Local Development

```text
WSL2 Ubuntu
├── Web App (Next.js dev server)
├── Worker (BullMQ consumer)
└── Docker Compose
    ├── PostgreSQL 18
    └── Redis 8
```

### Production

```text
DigitalOcean Droplet (Sydney)
├── Coolify (orchestration)
├── Web (containerized Next.js)
├── Worker (containerized Node.js)
├── PostgreSQL (container)
└── Redis (container)
```

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
# Edit .env with your API keys

# Initialize database
pnpm --filter @price-monitor/db push

# Start apps (two terminals)
pnpm --filter @price-monitor/web dev      # Terminal 1
pnpm --filter @price-monitor/worker dev   # Terminal 2

# Open dashboard
open http://localhost:3000
```

## Deployment

Production deployment is fully automated:

1. **Develop:** Work on `dev` branch locally
2. **Release:** Create PR to `main`, review, merge
3. **Deploy:** GitHub Actions builds and pushes to GHCR
4. **Go Live:** Coolify auto-deploys via webhook

Zero manual intervention required.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive development guide
- **[docs/production-env.md](docs/production-env.md)** - Production environment configuration
- **[specs/implementation-3/](specs/implementation-3/)** - Architecture and implementation specs

## License

MIT
