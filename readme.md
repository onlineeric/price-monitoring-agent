# Price Monitor AI Agent

AI-powered price monitoring system that tracks product prices, stores history, and sends digest emails with trend analysis.

## Features

- 🤖 **AI-powered price extraction** - Anthropic Claude, OpenAI GPT, Google Gemini
- 🌐 **Multi-site support** - Works with major e-commerce platforms (Amazon, eBay, etc.)
- 📊 **Price history tracking** - Comprehensive historical data with trend analysis
- 📧 **Automated digest emails** - Scheduled reports with price insights
- 🎨 **Professional dashboard** - Built with Shadcn UI and Tailwind CSS
- 🐳 **Docker-based services** - Local PostgreSQL & Redis via docker-compose
- 🚀 **Production-ready** - Automated deployment to DigitalOcean

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
- **Local Development:** docker-compose on WSL2 Ubuntu
- **Production:** Coolify on DigitalOcean (Sydney)
- **Database:** PostgreSQL 18
- **Cache/Queue:** Redis 8
- **Registry:** GitHub Container Registry (GHCR)
- **CICD:** GitHub Actions

## Architecture

### Local Development
```
WSL2 Ubuntu
├── Web App (pnpm dev)
├── Worker (pnpm dev)
└── docker-compose
    ├── PostgreSQL 18
    └── Redis 8
```

### Production
```
Developer → GitHub → GitHub Actions
                          ↓
              GitHub Container Registry
                          ↓
              Coolify (DigitalOcean)
                          ↓
        Web + Worker + PostgreSQL + Redis
              (Docker containers)
```

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- Docker Desktop (or Docker Engine on WSL2)

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

3. **Start services:**
   ```bash
   pnpm docker:up  # Starts PostgreSQL & Redis
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (DATABASE_URL and REDIS_URL already set to localhost)
   ```

5. **Push database schema:**
   ```bash
   pnpm --filter @price-monitor/db push
   ```

6. **Run apps:**
   ```bash
   # Terminal 1: Web app
   pnpm --filter @price-monitor/web dev      # Port 3000

   # Terminal 2: Worker
   pnpm --filter @price-monitor/worker dev   # Background
   ```

7. **Access dashboard:**
   Open http://localhost:3000

8. **Stop services (when done):**
   ```bash
   pnpm docker:down
   ```

## Development Workflow

### Local Development
```bash
# Start services
pnpm docker:up

# Run apps with hot reload
pnpm --filter @price-monitor/web dev
pnpm --filter @price-monitor/worker dev

# Stop services when done
pnpm docker:down
```

### Production Deployment
```bash
# Create PR: dev → main
# Review and merge
# GitHub Actions auto-deploys to production
```

## Deployment

### Local Development
- Code runs on host machine with hot reload (`pnpm dev`)
- Services (PostgreSQL, Redis) run via docker-compose
- Fast iteration with instant feedback

### Production
- **Platform:** DigitalOcean Droplet with Coolify orchestration
- **Deployment:** Automatic on `main` branch merge
- **Flow:** GitHub Actions → GHCR → Coolify → Production

**Production Deployment Flow:**
1. Push/merge to `main` branch
2. GitHub Actions builds Docker images (`:latest` tag)
3. Images pushed to GitHub Container Registry
4. Coolify webhook triggers auto-deployment
5. Production updated with new images

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
│   ├── implementation-1/ # Serverless approach (archived)
│   ├── implementation-2/ # VM-based approach (archived)
│   └── implementation-3/ # Current simplified approach
├── docs/                 # Documentation
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
pnpm docker:up                            # Start PostgreSQL & Redis
pnpm docker:down                          # Stop services
pnpm --filter @price-monitor/web dev      # Start web app
pnpm --filter @price-monitor/worker dev   # Start worker
pnpm --filter @price-monitor/db studio    # Open database UI
pnpm --filter @price-monitor/db push      # Push schema to DB
```

**Docker Services:**
```bash
docker ps                                 # List running containers
docker logs price-monitoring-agent-postgres-1  # PostgreSQL logs
docker logs price-monitoring-agent-redis-1     # Redis logs
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
- **[specs/implementation-3/](specs/implementation-3/)** - Implementation specifications
- **[docs/production-env.md](docs/production-env.md)** - Environment variables reference

## Implementation Status

**Current:** Implementation 3 (Simplified Local Dev + Production)

- ✅ Core functionality complete
- 🚧 Phase 1: Local Development Simplification - In Progress
- 📋 Phase 2: Production Deployment - Planned

See [specs/implementation-3/task-overview.md](specs/implementation-3/task-overview.md) for detailed roadmap.

## License

MIT

## Contributing

This is a personal demo project, but suggestions and feedback are welcome!
