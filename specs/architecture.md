# Price Monitor AI Agent – Overall Architecture

## Goal
A demo-friendly, high-performance system that:
- Monitors product prices from URLs
- Stores price history via a modern serverless-ready ORM
- Sends daily digests and instant discount alerts
- Uses AI for fallback extraction and data parsing
- Demonstrates senior-level system design (Queues, Workers, Cron, CI/CD)

---

## Tech Stack

### Application
- **Frontend + API**: Next.js (TypeScript) → **Vercel**
- **Background Worker**: Node.js (Docker) → **Render**
- **Authentication**: Public Dashboard (Read) / Basic Auth (Write/Admin)

### Data & Messaging
- **Database**: PostgreSQL → **Neon**
- **ORM**: **Drizzle ORM** (Serverless & Edge ready)
- **Redis**: **Upstash**
- **Queue**: **BullMQ** (uses Redis)

### Extraction & AI
- **Web extraction**: HTTP fetch + **Playwright** with stealth mode (playwright-extra)
- **Bot detection bypass**: puppeteer-extra-plugin-stealth (~70-80% success rate)
- **AI SDK**: **Vercel AI SDK** (provider-agnostic abstraction)
- **AI Providers**: OpenAI, Google Gemini, Anthropic Claude (configurable via env)

### Email
- **Email service**: **Resend**
- **Templates**: **React Email**

---

## High-Level Components

### 1) Next.js App (Vercel)
**Responsibilities**
- **UI**: Public dashboard showing tracked products and price trends.
- **Admin API**: Protected endpoints (Basic Auth) to add/edit products.
- **Cron Endpoint**: Receives scheduled triggers from **Vercel Cron** to enqueue check jobs.

---

### 2) Background Worker (Render)
**Responsibilities**
- Listens to **BullMQ** job queue (Consumer).
- Executes the extraction pipeline (Playwright/AI).
- Stores results using **Drizzle ORM**.
- Evaluates alert rules and triggers email notifications.

---

### 3) Price Extraction Pipeline
**Strategy** (2-Tier Fallback with Integrated AI)
1. **Tier 1 - Fast Path**: HTTP fetch + Cheerio (static HTML parsing)
2. **Tier 2 - Robust + Smart Path**: Playwright headless browser with stealth mode
   - **Stealth Mode**: playwright-extra + stealth plugin bypasses ~70-80% of bot detection
   - First attempt: Selector-based extraction
   - Fallback: AI extraction using the same rendered HTML

**AI Integration**: When Playwright successfully loads a page but selectors fail to extract data, the fully-rendered HTML (with JavaScript executed) is passed to Vercel AI SDK for intelligent extraction.

**Bot Detection Bypass**: playwright-extra with stealth plugin removes automation signals, allowing access to protected sites (Cloudflare, DataDome, anti-bot systems).

**Provider Selection**: Set via `AI_PROVIDER` environment variable (openai | google | anthropic)

---

## Data Model (High Level)
- **Product**: URL, name, active flag, cron schedule settings.
- **PricePoint**: productId, price, currency, timestamp.
- **AlertRule**: productId, threshold configuration.
- **RunLog**: Status and error tracking for debugging.

---

## Job Flow

### A. Manual / Admin Action
1. User adds product via UI (Basic Auth).
2. API enqueues a `check-price` job to BullMQ.
3. Worker picks up the job: Fetch → Extract → Drizzle Save.

### B. Scheduled Check (Cron)
1. **Vercel Cron** sends a GET request to `/api/cron/check-all` at scheduled times.
2. API queries all active products from DB.
3. API enqueues `check-price` jobs for each product.
4. Worker processes the queue in background.

---

## Hosting Summary
| Component | Platform |
|---|---|
| Web App | Vercel |
| Worker | Render |
| PostgreSQL | Neon |
| Redis | Upstash |
| Email | Resend |

---

## CI/CD (GitHub Actions)

### Approach
On every push/merge to `main`:
1. **Lint & Test**: Run checks on the monorepo.
2. **Web App**: Vercel automatically deploys the Next.js app.
3. **Worker**: GitHub Actions builds the Docker image and pushes to Render (or triggers Render deploy hook).---
---

## Hosting Stack
The following components are planned to be hosted on the following platforms:
| Component | What Runs There | Platform | Entry URL |
|---------|----------------|----------|-----------|
| Frontend + API | Next.js App (UI + API routes) | **Vercel** | https://vercel.com |
| Background Worker | Node.js Worker (BullMQ + Playwright) | **Render** | https://render.com |
| Job Queue Engine | **BullMQ (Node library)** | Runs inside Worker (Render) | N/A (library, not hosted) |
| Redis | BullMQ queue storage | **Upstash** | https://upstash.com |
| Database | PostgreSQL | **Neon** | https://neon.tech |
| Email Service | Transactional email delivery | **Resend** | https://resend.com |
| AI SDK | Provider-agnostic LLM abstraction | **Vercel AI SDK** | https://sdk.vercel.ai |
| AI Providers | LLM extraction (configurable) | **OpenAI / Google / Anthropic** | Multiple |
| CI/CD | Build & deploy pipelines | **GitHub Actions** | https://github.com/features/actions |
| Container Registry (optional) | Worker Docker images | **Docker Hub** | https://hub.docker.com |
