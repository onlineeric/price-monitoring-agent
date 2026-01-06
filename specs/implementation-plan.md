# Price Monitor Agent – Implementation Roadmap

## Document overview
This document provides an overview of the implementation plan of our Price Monitor AI Agent.

**Cautions:** This is an overview implementation plan document. Do NOT put tecnhical details in this document, only the overall plan. Put technical details in the task specifications.

## Quick Links
- [Architecture](architecture.md) - overview, high-level architecture
- [Task Specifications](task-*.md) - detailed task specifications, detailed technical specifications for each task

## Implementation Plan
- We are using **Spec-Driven Development** (Write Spec → Generate Code → Review & Refine) to implement the project.  
- Spec documents are the source of truth for the implementation.  
- For any updates to the implementation plan, update the spec documents first.

**Total Estimated Effort:** ~50 - 68 Hours  

## Phase 1: Foundation & Infrastructure (The Skeleton)
**Goal:** Initialize the Monorepo, set up the Database with Drizzle, and get local infrastructure running.
* **Task 1.1: Repo Setup**
    * Initialize Monorepo (TurboRepo or simple npm workspaces).
    * Create apps: `apps/web` (Next.js) and `apps/worker` (Node.js).
    * Setup `packages/db` for shared Drizzle schema.
* **Task 1.2: Database & ORM**
    * Setup **Neon** (Postgres) project.
    * Install **Drizzle ORM** & **Drizzle Kit**.
    * Define Schema: `products`, `price_points`, `alert_rules`.
    * Run first migration & verify connection.
* **Task 1.3: Local Dev Environment**
    * Create `docker-compose.yml` for local **Redis**
    * Verify both apps can connect to DB and Redis.
* **Estimate:** 4 - 6 Hours

## Phase 2: The Core Loop (Queue & Worker Engine)
**Goal:** Establish the asynchronous communication channel. A "Check Price" command from the API should reach the Worker.
* **Task 2.1: BullMQ Setup (Worker Side)**
    * Implement the `Worker` class in `apps/worker`.
    * Setup Redis connection logic.
    * Create a simple job processor that logs "Job Received".
* **Task 2.2: BullMQ Setup (Web Side)**
    * Implement the `Queue` producer in `apps/web`.
    * Create an internal API route `POST /api/debug/trigger` to push a test job.
* **Task 2.3: End-to-End Test**
    * Hit API → Job enqueued → Worker logs message.
* **Estimate:** 4 - 6 Hours

## Phase 3: The Scraper (Business Logic A - Extraction)
**Goal:** The worker actually visits a URL and extracts data using the "Fast Path" and "Robust Path".
* **Task 3.1: Scraper Service Structure**
    * Design the `ScraperInterface`.
    * Implement `HtmlFetcher` (fetch + cheerio/jsdom) for static sites.
* **Task 3.2: Playwright Integration**
    * Install Playwright in `apps/worker`.
    * Implement `HeadlessBrowserService` for dynamic sites.
    * Add stealth mode (`playwright-extra` + stealth plugin) to bypass bot detection.
    * Handle Docker compatibility (ensure it runs in container).
* **Task 3.3: Basic Extraction Logic**
    * Write logic to extract `Title`, `Price`, `Currency` from a target site (e.g., Amazon/eBay).
    * Save results to DB using Drizzle.
* **Estimate:** 10 - 14 Hours

## Phase 4: AI Intelligence
**Goal:** Integrate AI extraction and set up email infrastructure for digest reports.
* **Task 4.1: Vercel AI SDK Integration**
    * Install **Vercel AI SDK** and provider packages (@ai-sdk/openai, @ai-sdk/google, @ai-sdk/anthropic).
    * Install **playwright-extra** with stealth plugin to bypass bot detection on protected sites.
    * Create provider-agnostic `aiExtract()` function that accepts HTML as parameter.
    * Integrate AI into Playwright: when selectors fail, pass fully-rendered HTML to AI.
    * Implement structured output with Zod schema validation.
    * **Architecture:** AI is NOT a separate tier - it's called from within Playwright when needed.
* **Task 4.1 Enhancement: Schema Updates**
    * Remove `alertRules` table and `products.schedule` column (no longer needed).
    * Add `products.last_success_at` and `last_failed_at` timestamp columns.
    * Update code to track success/failure timestamps.
* **Task 4.2: Email Infrastructure & Settings**
    * Create `settings` table for global configuration (key-value store).
    * Setup **Resend** and **React Email** for digest notifications.
    * Create digest email template with product table and trends.
    * Implement email service to send digest emails.
    * Initialize default email schedule settings.
* **Estimate:** 8 - 10 Hours

## Phase 5: Dashboard & Management
**Goal:** Build professional dashboard using [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template with sidebar navigation, product management, and settings.
* **Task 5.0: Template Setup & Migration**
    * Clone dashboard template to `apps/dashboard_template` (reference only).
    * Replace `apps/web` with template structure.
    * Adapt to monorepo (rename package to `@price-monitor/web`).
    * Connect to `@price-monitor/db` package.
    * Migrate existing API routes (`/api/debug/trigger`).
    * Configure sidebar navigation for Price Monitor pages.
    * Verify everything works locally.
* **Task 5.1: Dashboard Home Page**
    * Build summary stats cards (total products, price trends, etc.).
    * Add "Check All & Send Email" button (triggers manual digest).
    * Use template's card components and responsive layout.
    * Fetch aggregate data using Drizzle in Server Components.
* **Task 5.2: Products Management Page**
    * Create Products page in sidebar navigation.
    * Build card view with product images, prices, and mini charts.
    * Build table view with TanStack Table (sortable, filterable).
    * Add view toggle (card/table switch).
    * Implement CRUD operations with Shadcn Dialog/Form components.
    * Add/Edit product forms with React Hook Form + Zod validation.
    * Delete confirmation with Shadcn AlertDialog.
    * Toast notifications for success/error feedback.
    * No authentication required (public access for demo).
* **Task 5.3: Settings Page**
    * Create Settings page in sidebar navigation.
    * Build email schedule configuration UI with Shadcn components.
    * Use RadioGroup for frequency (daily/weekly).
    * Use Select component for day/hour selection.
    * Proper form validation and error handling.
    * No authentication required (public access for demo).
* **Estimate:** 14 - 20 Hours

## Phase 6: Automation & Digest Emails
**Goal:** Implement manual and scheduled digest email system.
* **Task 6.1: Trend Calculation Service**
    * Create service to calculate price trends for all products.
    * Calculate 7/30/90/180 day average prices from price records.
    * Calculate percentage changes (vs last check, vs averages).
    * Handle edge cases (insufficient data, failed scrapes).
* **Task 6.2: Manual Digest Trigger & Job Flow**
    * Implement "Check All & Send Email" button on dashboard.
    * Create API endpoint to trigger manual digest.
    * Use BullMQ Flow to orchestrate parent-child job pattern.
    * Worker creates child jobs (price checks), waits for completion.
    * Calculate trends and send digest email after all jobs complete.
* **Task 6.3: Scheduled Automation**
    * Configure **Vercel Cron** to run every 30 minutes.
    * Create `/api/cron/check-all` endpoint with smart scheduling logic.
    * Calculate next send time based on email schedule settings.
    * Trigger digest flow only when scheduled (prevent duplicates).
    * Update last sent timestamp after sending.
* **Estimate:** 8 - 12 Hours

## Phase 7: Deployment & CI/CD
**Goal:** Production Release.
* **Task 7.1: Dockerize Worker**
    * Optimize `Dockerfile` for Playwright (cache browsers).
* **Task 7.2: GitHub Actions**
    * Pipeline to build and push to Render.
* **Task 7.3: Vercel Deploy**
    * Deploy Next.js app.
    * Configure **Vercel Cron**.
* **Estimate:** 6 - 8 Hours