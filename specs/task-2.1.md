# Technical Spec: Phase 2.1 - BullMQ Worker Setup

**Phase:** 2.1
**Goal:** Initialize the BullMQ Worker in `apps/worker` to connect to the local Redis instance and listen for background jobs.  
**Context:** This worker acts as the **Consumer** in our architecture.

Step 1 and 2 are performed by developer manually.
Step 3 is performed by AI to generate the code.

## Prerequisites

* **Redis:** Ensure the local Redis container is running (`docker-compose up -d`).
* **Node.js:** Ensure you are in the `apps/worker` directory.

---

## 1. Dependencies Installation (Manual Step)

Install the core queue library and Redis client.

```bash
cd apps/worker

# Core dependencies
pnpm add bullmq ioredis

# Development dependencies (for environment variables)
pnpm add -D dotenv

```

## 2. Environment Configuration (Manual Step)

Create or update the `.env` file in `apps/worker` to include Redis connection details.

**File:** `apps/worker/.env`

```env
# Connection string for the local Redis Docker container
REDIS_URL="redis://localhost:6379"

```

---

## 3. Implementation Specifications (AI Generation Target)

The following files need to be generated to establish the worker logic.  
Ensure strict TypeScript typing and use ESM syntax.

### File 3.1: `apps/worker/src/config.ts`

* **Goal:** Centralized configuration management.
* **Requirements:**
* Load environment variables using `dotenv`.
* **Export `REDIS_CONNECTION`:** An object compatible with `ioredis` options, parsed from `REDIS_URL`.
* **Export `QUEUE_NAME`:** Set to generic constant `'price-monitor-queue'` (must match the Web App producer later).



### File 3.2: `apps/worker/src/jobs/priceCheck.ts`

* **Goal:** Define the specific processor function for price check jobs.
* **Requirements:**
* **Function Signature:** `export default async function priceCheckJob(job: Job)`
* **Logic:**
1. Log `[Job Started] ID: ${job.id}`.
2. Simulate a delay (e.g., 2 seconds) to mimic scraping time.
3. Log `[Job Completed] ID: ${job.id}`.
4. Return a simple success object: `{ status: 'success', processedAt: new Date() }`.





### File 3.3: `apps/worker/src/queue/worker.ts`

* **Goal:** Initialize and export the BullMQ Worker instance.
* **Requirements:**
* Import `Worker` from `bullmq`.
* Use `connection` from `../config`.
* **Worker Setup:**
* Instantiate `new Worker(QUEUE_NAME, priceCheckJob, { connection })`.


* **Event Listeners:**
* On `'completed'`: Log completion message.
* On `'failed'`: Log failure message with error details.


* **Export:** The `worker` instance.



### File 3.4: `apps/worker/src/index.ts`

* **Goal:** The entry point for the Worker service.
* **Requirements:**
* Import the `worker` from `./queue/worker`.
* Log a startup message: `"🚀 Worker Service is running and listening on queue..."`.
* Keep the process alive to listen for jobs.



---

## 4. Verification

Start the worker locally to ensure it connects to Redis without errors.

```bash
# In apps/worker
npx tsx apps/worker/src/index.ts

```

**Expected Output:**

```text
🚀 Worker Service is running and listening on queue...

```
