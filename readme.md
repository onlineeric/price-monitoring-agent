# Price Monitor AI Agent

AI-powered price monitoring system for tracking product prices over time.

## Prerequisites

- Node.js (LTS recommended)
- pnpm (this repo pins a version in `package.json`)
- Docker Desktop (or Docker Engine with `docker compose`)
- API keys:
  - One AI provider: Anthropic / OpenAI / Google
  - Resend (for email)

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


## Quick Start (Local Development)

1. Install dependencies
   ```bash
   pnpm install
   ```

2. Start PostgreSQL + Redis (Docker)
   ```bash
   pnpm docker:up
   ```

3. Configure environment variables
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:
   - `AI_PROVIDER` and the matching API key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`)
   - `RESEND_API_KEY`

   `DATABASE_URL` and `REDIS_URL` are already set for localhost in `.env.example`.

4. Create/update database schema
   ```bash
   pnpm --filter @price-monitor/db push
   ```

5. Start the app (two terminals)

   Terminal 1 (web):
   ```bash
   pnpm --filter @price-monitor/web dev
   ```

   Terminal 2 (worker):
   ```bash
   pnpm --filter @price-monitor/worker dev
   ```

6. Open the dashboard

   http://localhost:3000

7. Stop services when done
   ```bash
   pnpm docker:down
   ```

## Common Commands

```bash
# Docker services
pnpm docker:up
pnpm docker:down
pnpm docker:logs
pnpm docker:ps

# Apps
pnpm --filter @price-monitor/web dev
pnpm --filter @price-monitor/worker dev

# Database
pnpm --filter @price-monitor/db push
pnpm --filter @price-monitor/db studio

# Code quality
pnpm lint
```

## License

MIT

## Contributing

This is a personal demo project, but suggestions and feedback are welcome!
