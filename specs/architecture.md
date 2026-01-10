# Price Monitor AI Agent – Overview Architecture

## Document overview
This document provides an overview of the architecture of our Price Monitor AI Agent.

**Cautions:** This is an overview architecture document. Do NOT put tecnhical details in this document.

## Quick Links
- [Implementation Plan](implementation-plan.md) - overview of the implementation plan
- [Task Specifications](task-*.md) - detailed task specifications, detailed technical specifications for each task

---

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
- **Frontend + API**: Next.js 16 (TypeScript) → **Vercel**
  - UI Framework: Shadcn UI (Radix primitives)
  - Styling: Tailwind CSS v4
  - Forms: React Hook Form + Zod validation
  - Tables: TanStack Table
  - State: Zustand
  - Charts: Recharts
- **Background Worker**: Node.js (Docker) → **Render**
- **Authentication**: Public access (no authentication for demo purposes)

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
- **UI**: Professional dashboard built on [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template
  - Dashboard home with summary stats and manual trigger
  - Products management page (add/edit/delete products)
  - Settings page (email schedule configuration)
  - Full sidebar navigation with light/dark mode
  - Shadcn UI components, TanStack Table, React Hook Form + Zod validation
- **Admin API**: Public access (no authentication required for demo purposes)
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
- **Product**: URL (unique), name, active flag, last success/failure timestamps.
- **PriceRecord**: productId, price, currency, timestamp.
- **Settings**: Key-value store for global configuration (email schedule, etc.).
- **RunLog**: Status and error tracking for debugging.

---

## Job Flow

### A. Manual / Debug Trigger (Single Product)
1. User/Developer sends URL to debug endpoint: `POST /api/debug/trigger`
2. API enqueues a `check-price` job to BullMQ
3. Worker picks up the job: Scrape → Extract → Save to database

### B. Manual Digest Trigger (All Products + Email)
1. User clicks "Check All & Send Email" button on dashboard home page
2. API enqueues a `send-digest` job to BullMQ
3. Worker creates parent-child job flow:
   - Parent job: orchestrates the flow
   - Child jobs: one `check-price` job per active product
4. Worker waits for all child jobs to complete
5. Worker calculates price trends (7/30/90/180 day averages)
6. Worker sends digest email with all products and trends

### C. Scheduled Digest (Automated)
1. **Vercel Cron** sends GET request to `/api/cron/check-all` every 30 minutes
2. API checks email schedule settings (daily/weekly, time)
3. API calculates if current time matches schedule
4. If YES: Trigger same digest flow as (B), update last sent timestamp
5. If NO: Skip and wait for next cron run

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

## Future Enhancements Roadmap

The following features are planned for future implementation:

### Security & Authentication
- **User Authentication**: Implement authentication/authorization across the entire application
- **Role-Based Access Control (RBAC)**: Admin vs read-only users with different permission levels
- **API Security**: Secure all API endpoints with proper session management and token-based auth
- **Audit Logging**: Track sensitive operations (deletions, settings changes, manual triggers)

### Extraction Features
- **Force AI Extraction Mode**: Allow users to bypass HTML/Playwright tiers and force AI extraction for specific products or all products
- **Configurable Extraction Strategies**: Per-product configuration for extraction method preferences
- **Custom Extraction Rules**: Support for custom CSS selectors and XPath patterns per product
- **Multi-Region Support**: Proxy rotation for region-specific pricing

### Monitoring & Observability
- **Real-Time Job Status Dashboard**: Live view of running jobs with progress indicators
- **Failed Job Retry Mechanism**: Automatic retry with exponential backoff for failed extractions
- **Price Change History Visualization**: Interactive charts showing price trends over time
- **Email Delivery Status Tracking**: Monitor email send success/failure rates
- **Worker Health Monitoring**: CPU, memory, and queue depth metrics

### User Experience Enhancements
- **Multi-User Support**: Individual user accounts with separate product lists
- **Product Tagging & Categorization**: Organize products with custom tags and categories
- **Custom Price Alerts**: Per-product threshold alerts (notify when price drops below X)
- **Browser Extension**: One-click product monitoring from any e-commerce site
- **Mobile-Responsive Dashboard**: Improved mobile UI/UX
- **Bulk Operations**: Bulk add/edit/delete products via CSV import

### Data & Analytics
- **Price Prediction**: ML-based price trend forecasting
- **Historical Data Export**: CSV/JSON export of price history
- **Comparative Analytics**: Cross-product price comparison reports
- **Discount Pattern Analysis**: Identify best times to buy based on historical patterns

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
