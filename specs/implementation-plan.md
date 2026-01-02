# Price Monitor Agent – Implementation Roadmap

**Total Estimated Effort:** ~50 - 68 Hours
**Approach:** Spec-Driven Development (Write Spec → Generate Code → Review & Refine)

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
**Goal:** Build public dashboard and admin tools for product and settings management.
* **Task 5.1: Public Dashboard**
    * Build `ProductCard` and `PriceChart` components (using Recharts).
    * Display all products with current prices and price history charts.
    * Fetch data using Drizzle in Server Components.
    * Show product stats (high/low/average prices).
* **Task 5.2: Admin Product Management**
    * Create Basic Auth middleware for admin operations.
    * Build admin panel UI for adding products.
    * Create API endpoints for product CRUD (GET, POST, PATCH, DELETE).
    * Secure write operations with Basic Auth.
* **Task 5.3: Settings Management UI**
    * Create UI for email schedule configuration (daily/weekly, time picker).
    * Build API endpoint for reading and updating email schedule.
    * Display current schedule and next send time.
    * Validate schedule settings before saving.
* **Estimate:** 10 - 14 Hours

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