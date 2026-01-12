# Price Monitor AI Agent

AI-powered price monitoring system that tracks product prices, stores history, and sends digest emails with trend analysis.

## Features

- 🤖 **AI-powered price extraction** - Anthropic Claude, OpenAI GPT, Google Gemini
- 🌐 **Multi-site support** - Works with major e-commerce platforms (Amazon, eBay, etc.)
- 📊 **Price history tracking** - Comprehensive historical data with trend analysis
- 📧 **Automated digest emails** - Scheduled reports with price insights
- 🎨 **Professional dashboard** - Built with Shadcn UI and Tailwind CSS
- 🐳 **Fully containerized** - Docker-based deployment with Coolify
- 🚀 **Self-hosted infrastructure** - Complete control on DigitalOcean

## Tech Stack

### Frontend & API
- Next.js 16 (React, TypeScript)
- Shadcn UI + Tailwind CSS v4
- TanStack Table, React Hook Form + Zod
- Drizzle ORM

### Background Processing
- Node.js worker with BullMQ
- Playwright for browser automation
- Vercel AI SDK (multi-provider support)

### Infrastructure
- **Local Development:** Coolify on Multipass VM
- **Production:** Coolify on DigitalOcean (Sydney)
- **Database:** PostgreSQL 15
- **Cache/Queue:** Redis 7
- **Registry:** GitHub Container Registry (GHCR)
- **CICD:** GitHub Actions

## Architecture

```
Developer → GitHub
             ↓
         GitHub Actions
         (build :dev/:latest images)
             ↓
   GitHub Container Registry (GHCR)
             ↓
         Coolify (orchestration)
             ↓
    Web + Worker + PostgreSQL + Redis
       (Docker containers)
```

**Deployment Environments:**
- **Local VM:** Multipass Ubuntu VM for testing deployment
- **Production:** DigitalOcean Droplet in Sydney region

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Multipass (for local VM)
- Docker (for local testing)

### Setup

1. **Clone repository:**
   ```bash
   git clone <repo-url>
   cd price-monitoring-agent
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up local VM:**
   See [CLAUDE.md](CLAUDE.md) for detailed instructions:
   - Install Multipass
   - Create Ubuntu 22.04 VM
   - Install Coolify
   - Provision PostgreSQL and Redis containers

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your VM IP and API keys
   ```

5. **Push database schema:**
   ```bash
   pnpm --filter @price-monitor/db push
   ```

6. **Run locally:**
   ```bash
   # Terminal 1: Web app
   pnpm --filter @price-monitor/web dev      # Port 3000

   # Terminal 2: Worker
   pnpm --filter @price-monitor/worker dev   # Background
   ```

7. **Access dashboard:**
   Open http://localhost:3000

## Development Workflow

### Local Development (Fastest)
```bash
# Run code locally, connect to VM services
pnpm --filter @price-monitor/web dev
pnpm --filter @price-monitor/worker dev
```

### Containerized Testing
```bash
# Push to dev branch → GitHub Actions builds :dev images
git push origin dev

# Redeploy on local VM
pnpm redeploy:local
```

### Production Deployment
```bash
# Create PR: dev → main
# Review and merge
# GitHub Actions auto-deploys to production
```

## Deployment

This project uses a self-hosted deployment approach with Coolify on DigitalOcean.

### Deployment Flow

1. **Push code** to `dev` or `main` branch
2. **GitHub Actions** builds Docker images
3. **Images pushed** to GHCR
4. **Coolify pulls** and deploys images
   - `:dev` tag → Local VM (manual trigger)
   - `:latest` tag → Production (automatic)

### Environments

**Local Development:**
- Code runs on host machine (`pnpm dev`)
- Connects to services in Multipass VM
- Fast iteration with hot reload

**Local Staging:**
- Full containerized deployment in Multipass VM
- Tests deployment process before production
- Uses `:dev` images from GHCR

**Production:**
- DigitalOcean Droplet in Sydney region
- Automatic deployment on `main` branch merge
- Uses `:latest` images from GHCR

For detailed deployment instructions, see [CLAUDE.md](CLAUDE.md).

## Project Structure

```
price-monitoring-agent/
├── apps/
│   ├── web/              # Next.js dashboard (UI + API)
│   └── worker/           # Background worker (BullMQ + Playwright)
├── packages/
│   └── db/               # Shared Drizzle schema
├── specs/                # Implementation specifications
│   ├── implementation-1/ # Original serverless approach (archived)
│   └── implementation-2/ # Current self-hosted approach
├── scripts/              # Utility scripts (redeploy-local, etc.)
├── docs/                 # Documentation (production-env.md)
└── .github/workflows/    # GitHub Actions CICD
```

## Key Features

### 2-Tier Extraction Pipeline

**Tier 1: HTML Fetcher** (~100-500ms)
- Fast static HTML parsing with Cheerio
- Multiple selector fallbacks
- Free, instant results

**Tier 2: Playwright + AI** (~3-6s)
- Headless browser with stealth mode
- Bypasses bot detection (~70-80% success)
- AI fallback for complex pages
- Structured output validation

### Scheduled Digest Emails

- **BullMQ Repeatable Jobs** - No external cron needed
- **Worker-managed scheduling** - Always-on, no cold starts
- **Dynamic schedule updates** - Changes detected within 5 minutes
- **Trend analysis** - 7/30/90/180 day price averages

### Professional Dashboard

- Built on [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template
- Full sidebar navigation
- Product management (add/edit/delete)
- Settings page (email schedule configuration)
- Light/dark mode support

## Commands

See [CLAUDE.md](CLAUDE.md) for complete command reference.

**Development:**
```bash
pnpm --filter @price-monitor/web dev      # Start web app
pnpm --filter @price-monitor/worker dev   # Start worker
pnpm --filter @price-monitor/db studio    # Open database UI
```

**Local VM:**
```bash
multipass list                            # List VMs
multipass info coolify-local              # Get VM details
pnpm redeploy:local                       # Redeploy to local VM
```

**Production:**
```bash
# Merge to main → auto-deploys to production
git checkout dev
git pull origin dev
gh pr create --base main --head dev
```

## Environment Variables

See `docs/production-env.md` for complete documentation.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `AI_PROVIDER` - AI provider (openai | google | anthropic)
- `ANTHROPIC_API_KEY` - Anthropic API key
- `RESEND_API_KEY` - Email service API key

**Worker-specific:**
- `ENABLE_SCHEDULER` - Enable BullMQ Repeatable Jobs (only ONE worker)

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete developer guide
- **[specs/implementation-2/task-overview.md](specs/implementation-2/task-overview.md)** - Implementation roadmap
- **[docs/production-env.md](docs/production-env.md)** - Environment variables reference

## Implementation Status

**Current:** Implementation 2 (Self-hosted Micro-PaaS)

- ✅ Phase 1-6: Core functionality complete
- ✅ Phase 7.1: Worker Dockerization complete
- 🚧 Phase 1 (Impl 2): Local VM + CICD - In Progress
- 📋 Phase 2 (Impl 2): Production Deployment - Planned

See [specs/implementation-2/](specs/implementation-2/) for detailed specifications.

## License

MIT

## Contributing

This is a personal demo project, but suggestions and feedback are welcome!
