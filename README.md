# Price Monitor AI Agent

A price monitoring application that tracks product prices from URLs, stores price history, and sends digest emails with trend analysis.

## Features

- **Price Monitoring**: Add product URLs and track price changes over time
- **AI-Powered Extraction**: Uses 2-tier extraction (HTML parsing → Playwright + AI fallback)
- **Price History**: View historical price data with charts
- **Email Digests**: Scheduled email reports with price trends
- **Dashboard**: Web UI for managing products and viewing analytics

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop or Docker Engine

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd price-monitoring-agent
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start database services**
   ```bash
   pnpm docker:up  # Starts PostgreSQL & Redis
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Initialize database**
   ```bash
   pnpm --filter @price-monitor/db push
   ```

6. **Start applications**
   ```bash
   # Terminal 1: Web app
   pnpm --filter @price-monitor/web dev

   # Terminal 2: Worker
   pnpm --filter @price-monitor/worker dev
   ```

7. **Open the dashboard**
   - Navigate to http://localhost:3000

## Deployment

This project uses a self-hosted deployment approach with Coolify on DigitalOcean.

### Architecture

```
Developer → GitHub (code)
             ↓
         GitHub Actions
         (build :latest images)
             ↓
   GitHub Container Registry (GHCR)
             ↓
         Coolify (production)
         (auto-deploys via webhook)
             ↓
    Web + Worker + PostgreSQL + Redis
       (DigitalOcean Droplet, Sydney)
```

### Environments

**Environment 1: Local Development**
- Code runs on host machine (`pnpm dev`)
- Connects to PostgreSQL/Redis via Docker Compose on localhost
- Fast iteration with hot reload

**Environment 2: Production Deployment**
- DigitalOcean Droplet in Sydney region
- Automatic deployment on `main` branch merge
- Uses `:latest` images from GHCR

### Deployment Workflow

1. **Develop:** Work on `dev` branch locally (`pnpm docker:up` + `pnpm dev`)
2. **Release:** Create PR `dev` → `main`, review, merge
3. **Deploy:** GitHub Actions builds `:latest`, triggers production deployment
4. **Verify:** Check production logs, test live application

### Production Access

**Web Application:** `http://<production-ip>`
**Coolify Dashboard:** `http://<production-ip>:8000`

For detailed deployment instructions, see [CLAUDE.md](CLAUDE.md).

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive development guide
- **[docs/production-env.md](docs/production-env.md)** - Production environment variables
- **[specs/implementation-3/](specs/implementation-3/)** - Architecture and task specs

## Tech Stack

- **Frontend**: Next.js 16, Shadcn UI, Tailwind CSS v4
- **Backend**: Node.js, BullMQ
- **Database**: PostgreSQL 18, Redis 8
- **ORM**: Drizzle ORM
- **AI**: Vercel AI SDK (OpenAI, Anthropic, Google)
- **Email**: Resend + React Email
- **Infrastructure**: Docker, Coolify, DigitalOcean

## License

MIT
