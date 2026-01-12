# Task 1.19: Update Project Documentation

**Type:** AI Generation
**Performer:** AI
**Phase:** 1 - Local VM + CICD

---

## Objective

Comprehensively update README.md and CLAUDE.md to reflect Implementation 2 architecture, workflow, and commands. Ensure all documentation is accurate, complete, and helpful for developers.

---

## Context

This is the final AI task in Phase 1. It consolidates all documentation updates to ensure:
- README.md provides clear project overview for external viewers
- CLAUDE.md provides complete developer guide
- All old infrastructure references removed
- New workflow clearly documented

---

## Files to Update

### 1. README.md

**Audience:** General public, potential users, recruiters

**Structure:**

```markdown
# Price Monitor AI Agent

AI-powered price monitoring system that tracks product prices, stores history, and sends digest emails with trend analysis.

## Features

- 🤖 AI-powered price extraction (Anthropic Claude, OpenAI, Google Gemini)
- 🌐 Supports major e-commerce sites (Amazon, eBay, etc.)
- 📊 Price history tracking and trend analysis
- 📧 Automated digest emails with price insights
- 🎨 Professional dashboard built on Shadcn UI
- 🐳 Fully containerized architecture
- 🚀 Self-hosted on Coolify

## Tech Stack

### Frontend & API
- Next.js 16 (React, TypeScript)
- Shadcn UI + Tailwind CSS
- TanStack Table, React Hook Form
- Drizzle ORM

### Background Processing
- Node.js worker with BullMQ
- Playwright for browser automation
- Vercel AI SDK (multi-provider)

### Infrastructure
- **Local Development:** Coolify on Multipass VM
- **Production:** Coolify on DigitalOcean (Sydney)
- **Database:** PostgreSQL 15
- **Cache/Queue:** Redis 7
- **Registry:** GitHub Container Registry
- **CICD:** GitHub Actions

## Architecture

[Provide updated architecture diagram description or ASCII art]

```
Developer → GitHub
             ↓
         GitHub Actions (Build)
             ↓
   GitHub Container Registry
             ↓
         Coolify (Deploy)
             ↓
    Web App + Worker + DB + Redis
```

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

3. **Set up local VM:** (See [CLAUDE.md](CLAUDE.md) for details)
   - Install Multipass
   - Create Ubuntu VM
   - Install Coolify
   - Provision PostgreSQL and Redis

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Push database schema:**
   ```bash
   pnpm --filter @price-monitor/db push
   ```

6. **Run locally:**
   ```bash
   pnpm --filter @price-monitor/web dev      # Port 3000
   pnpm --filter @price-monitor/worker dev   # Background
   ```

## Deployment

This project uses a self-hosted deployment approach with Coolify.

**Deployment Flow:**
1. Push code to `dev` or `main` branch
2. GitHub Actions builds Docker images
3. Images pushed to GHCR
4. Coolify pulls and deploys automatically

**Environments:**
- **Local VM:** For testing containerized deployment
- **Production:** DigitalOcean Droplet in Sydney

For detailed deployment instructions, see [CLAUDE.md](CLAUDE.md).

## Commands

See [CLAUDE.md](CLAUDE.md) for complete command reference.

## Project Structure

```
price-monitoring-agent/
├── apps/
│   ├── web/           # Next.js dashboard
│   └── worker/        # Background worker
├── packages/
│   └── db/            # Shared Drizzle schema
├── specs/             # Implementation specs
└── scripts/           # Utility scripts
```

## License

[Your License]

## Contributing

[Contributing guidelines if applicable]
```

### 2. CLAUDE.md

**Audience:** Developers, AI assistants, future maintainers

**Updates Needed:**

Update the existing CLAUDE.md with:

#### A. Update Project Overview

```markdown
## Project Overview

Price Monitor AI Agent - a system that monitors product prices from URLs, stores price history, and sends alerts for discounts. Uses traditional web extraction with AI fallback for complex pages.

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
- **Bot detection bypass**: puppeteer-extra-plugin-stealth
- **AI SDK**: **Vercel AI SDK** (provider-agnostic)
- **AI Providers**: OpenAI, Google Gemini, Anthropic Claude (configurable)

### Email
- **Email service**: **Resend**
- **Templates**: **React Email**

### Infrastructure
- **Local Dev**: Coolify on Multipass VM
- **Production**: Coolify on DigitalOcean Droplet (Sydney)
- **Container Registry**: GitHub Container Registry (GHCR)
- **CICD**: GitHub Actions
```

#### B. Repository Structure

```markdown
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
```

#### C. API Endpoints

```markdown
### Current API Endpoints

**POST /api/debug/trigger**
- Enqueues a price check job by URL
- Body: `{ url: string }`
- Returns: `{ success: boolean, jobId: string }`

**Manual Digest** (via UI button)
- Triggers digest email for all active products
- No direct API endpoint (handled via UI action)

**Settings API** (for email schedule configuration)
- Managed through dashboard settings page
```

#### D. Job Flow

```markdown
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
```

#### E. Scheduling Architecture

```markdown
## Scheduling Architecture

**Implementation 1 (Old):**
```
Vercel Cron (every 30 mins)
    ↓
GET /api/cron/check-all
    ↓
API checks schedule settings
    ↓
Enqueues jobs to BullMQ
```

**Implementation 2 (Current):**
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
```

---

## Deliverables

1. **Updated `README.md`:**
   - Clear project overview
   - Updated tech stack
   - New architecture description
   - Deployment section for Coolify
   - Quick start guide
   - Removed Vercel/Render references

2. **Updated `CLAUDE.md`:**
   - Complete environment configuration guide
   - Updated development workflow
   - Complete commands reference
   - Updated architecture documentation
   - Scheduling architecture explained
   - Removed old infrastructure references

---

## Verification Steps

1. **Read through README.md:**
   - Should be clear for external viewers
   - Should accurately describe the project
   - Should not mention Vercel/Render/Neon/Upstash

2. **Read through CLAUDE.md:**
   - Should be complete guide for developers
   - Should explain new workflow clearly
   - Should document all commands
   - Should explain Implementation 2 architecture

3. **Check for broken links:**
   - All internal links work
   - All commands are accurate

---

## Success Criteria

- [ ] README.md fully updated
  - [ ] Project overview accurate
  - [ ] Tech stack reflects Implementation 2
  - [ ] Architecture described
  - [ ] Deployment section added
  - [ ] Quick start guide included
  - [ ] No Vercel/Render references

- [ ] CLAUDE.md fully updated
  - [ ] Environment configuration documented
  - [ ] Development workflow clear
  - [ ] All commands listed and accurate
  - [ ] Scheduling architecture explained
  - [ ] Job flows documented
  - [ ] API endpoints listed
  - [ ] No old infrastructure references

- [ ] Documentation is clear and helpful
- [ ] No broken links
- [ ] No outdated information

---

## Notes

- This is the final documentation task for Phase 1
- After this, user will verify, build, and commit (task 1.20)
- Ensure documentation is complete as it guides future development
- Focus on clarity and accuracy
