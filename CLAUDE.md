# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Price Monitor AI Agent - a system that monitors product prices from URLs, stores price history, and sends alerts for discounts. Uses traditional web extraction with AI fallback for complex pages.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend/API**: Next.js 16 (TypeScript) → Vercel
- **Worker**: Node.js (Docker) → Render
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Queue**: BullMQ with Redis (Upstash)
- **Extraction**: HTTP fetch + Playwright (fallback) + OpenAI (final fallback)
- **Email**: Resend with React Email templates

## Repository Structure

```
apps/
  web/       # Next.js app - public dashboard + admin API + cron endpoints
  worker/    # BullMQ consumer - extraction pipeline, DB writes, alerts
packages/
  db/        # Shared Drizzle schema and database client
specs/       # Architecture docs and task specs
```

## Commands

### Root (pnpm workspaces)
```bash
pnpm install              # Install all dependencies
```

### Web App (apps/web)
```bash
pnpm --filter @price-monitor/web dev      # Start Next.js dev server
pnpm --filter @price-monitor/web build    # Production build
pnpm --filter @price-monitor/web lint     # Run ESLint
```

### Database (packages/db)
```bash
pnpm --filter @price-monitor/db generate  # Generate Drizzle migrations
pnpm --filter @price-monitor/db push      # Push schema to database
pnpm --filter @price-monitor/db studio    # Open Drizzle Studio
```

## Architecture

### Job Flow
1. **Manual**: User adds product via UI → API enqueues `check-price` job to BullMQ → Worker extracts and saves
2. **Scheduled**: Vercel Cron hits `/api/cron/check-all` → API queries active products → enqueues jobs for each

### Extraction Pipeline (Worker)
1. Parse structured data / HTML (fast path)
2. Use Playwright for JS-rendered pages
3. Use OpenAI only when extraction is uncertain

### Data Model
- **Product**: URL, name, active flag, cron schedule
- **PriceRecord**: productId, price (in cents), currency, timestamp
- **AlertRule**: productId, threshold configuration
- **RunLog**: Status and error tracking

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - Neon PostgreSQL connection string

## Implementation Status

Currently at Task 1.1 (repo setup). See `specs/implementation-plan.md` for full roadmap and `specs/task-*.md` for detailed task specs.
