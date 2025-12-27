# Price Monitor Agent – Implementation Roadmap

**Total Estimated Effort:** ~45 - 60 Hours
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
    * Create `docker-compose.yml` for local **Redis** (and optional local Postgres if offline).
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
    * Handle Docker compatibility (ensure it runs in container).
* **Task 3.3: Basic Extraction Logic**
    * Write logic to extract `Title`, `Price`, `Currency` from a target site (e.g., Amazon/eBay).
    * Save results to DB using Drizzle.
* **Estimate:** 10 - 14 Hours

## Phase 4: AI Intelligence (Business Logic B - Smart Parse)
**Goal:** Integrate OpenAI for when selectors fail or data is messy.
* **Task 4.1: OpenAI Integration**
    * Setup OpenAI SDK.
    * Create `AiExtractionService`.
* **Task 4.2: Prompt Engineering**
    * Design the system prompt: "Extract price and availability from this HTML snippet...".
    * Implement "Fallback Strategy": If `HeadlessBrowserService` fails to find price, send HTML snapshot to AI.
* **Estimate:** 6 - 8 Hours

## Phase 5: Dashboard & Management (Frontend)
**Goal:** Allow users to view data and add new monitors.
* **Task 5.1: Public Dashboard**
    * Build `ProductCard` and `PriceChart` (using Recharts or similar).
    * Fetch data using Drizzle in Server Components.
* **Task 5.2: Admin Actions (Basic Auth)**
    * Create `AddProductModal`.
    * Secure API routes (`POST /api/products`) with Basic Auth middleware.
* **Task 5.3: Manual Trigger**
    * Add a "Check Now" button that calls the queue API.
* **Estimate:** 8 - 12 Hours

## Phase 6: Automation & Notifications
**Goal:** Make it run automatically and alert on changes.
* **Task 6.1: Cron Endpoint**
    * Create `/api/cron/check-all`.
    * Logic: Query active products -> Add jobs to Queue.
* **Task 6.2: Email Service**
    * Setup **Resend** and **React Email**.
    * Design "Price Drop Alert" template.
* **Task 6.3: Alert Logic**
    * In Worker: After extraction, compare `current_price` < `target_price`.
    * Trigger email if condition met.
* **Estimate:** 6 - 8 Hours

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