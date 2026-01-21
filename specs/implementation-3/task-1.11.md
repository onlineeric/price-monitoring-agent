# Task 1.11: Update `readme.md`

**Type:** Documentation
**Phase:** 1 - Local Development Simplification

## Goal

Make the root `readme.md` a simple, reliable onboarding guide for local development.

- Audience: new developers
- Focus: setup + the few commands needed to run the app
- Avoid: deep architecture, production/CICD, detailed internals, long troubleshooting guides

## Scope

Update the root `readme.md` to:

- Remove VM / Multipass / WSL-specific setup guidance
- Standardize on the Docker Compose workflow for local Postgres + Redis
- Provide a short Quick Start that works end-to-end

## Content Requirements

### Keep

- One-paragraph project description
- Prerequisites
- Quick Start (copy/paste steps)
- Minimal environment variables guidance
- Minimal command reference
- A short troubleshooting section (only common blockers)

### Remove

- Detailed feature lists / marketing copy
- Full architecture diagrams and pipeline internals
- Production deployment instructions
- Extensive troubleshooting matrices
- References to docs intended for AI assistants

## Expected `readme.md` Sections

### 1) Prerequisites

- Node.js (LTS recommended)
- pnpm (project uses the version pinned in `package.json`)
- Docker Desktop / Docker Engine with `docker compose`
- API keys:
  - One AI provider key (Anthropic/OpenAI/Google)
  - Resend API key (email)

### 2) Quick Start

Order matters. Keep it short.

- `pnpm install`
- `pnpm docker:up`
- `cp .env.example .env` and fill required keys
- `pnpm --filter @price-monitor/db push`
- Run:
  - `pnpm --filter @price-monitor/web dev`
  - `pnpm --filter @price-monitor/worker dev`
- Open `http://localhost:3000`
- Stop services: `pnpm docker:down`

### 3) Key Environment Variables (minimal)

Mention only what a new dev must set in `.env`:

- `DATABASE_URL` (already set for localhost in `.env.example`)
- `REDIS_URL` (already set for localhost in `.env.example`)
- `AI_PROVIDER` + the matching API key
- `RESEND_API_KEY`
- Optional: `ENABLE_SCHEDULER` (keep `false` for local)

### 4) Commands (short)

List only the commands a dev will actually use:

- `pnpm docker:up`, `pnpm docker:down`, `pnpm docker:logs`, `pnpm docker:ps`
- `pnpm --filter @price-monitor/web dev`
- `pnpm --filter @price-monitor/worker dev`
- `pnpm --filter @price-monitor/db push`, `pnpm --filter @price-monitor/db studio`
- `pnpm lint`

### 5) Troubleshooting (only common)

- Docker not running
- Port conflicts (5432/6379)
- DB push fails (services not up / wrong `.env`)

## Verification

- README has no VM / Multipass references
- Commands match `package.json` scripts (no `docker:clean` unless it exists)
- `.env.example` values shown in README match the real `.env.example` defaults
