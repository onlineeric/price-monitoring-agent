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

Update the `.env` file in root folder to include Redis connection details.

add the following to the .env file in root folder:
```env
# Connection string for the local Redis Docker container
REDIS_URL="redis://localhost:6379"
```

---

## 3. Implementation Specifications (AI Generation Target)

The following files need to be generated to establish the worker logic.  
Ensure strict TypeScript typing and use ESM syntax.

### File 3.1: `apps/worker/src/config.ts`
* **Goal:** Load env vars and create the Redis connection instance.
* **Requirements:**
    * Import `dotenv`, `path` from 'path', `fileURLToPath` from 'url'.
    * Import `{ Redis }` from 'ioredis'.
    * **Path Resolution (ESM Native):**
        * Define `__filename = fileURLToPath(import.meta.url)`.
        * Define `__dirname = path.dirname(__filename)`.
        * Use `path.resolve(__dirname, '../../../.env')` to target the root env file.
    * **Env Loading:**
        * Call `dotenv.config({ path: ... })`.
    * **Connection Logic:**
        * Instantiate `const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })`.
        * *Note:* The `maxRetriesPerRequest: null` is strictly required by BullMQ.
    * **Exports:**
        * `connection` (The reusable Redis instance).
        * `QUEUE_NAME` = `'price-monitor-queue'`.
        
### File 3.2: `apps/worker/src/jobs/priceCheck.ts`
* **Goal:** Job processor function.
* **Signature:** `export default async function priceCheckJob(job: Job)`
* **Logic:**
    * Log `[${job.id}] Processing...`.
    * Simulate delay (1000ms).
    * Return `{ status: 'success' }`.

### File 3.3: `apps/worker/src/queue/worker.ts`
* **Goal:** Initialize BullMQ Worker.
* **Logic:**
    * Import `Worker` from `bullmq`.
    * Import `connection`, `QUEUE_NAME` from `../config`.
    * **Instantiate:** `new Worker(QUEUE_NAME, priceCheckJob, { connection })`.
        * *Note:* Reuse the connection instance exported from config.
    * **Listeners:** Log 'completed' and 'failed' events.

### File 3.4: `apps/worker/src/index.ts`
* **Goal:** Entry point.
* **Logic:**
    * Import `./queue/worker`.
    * Log startup message.
    * Keep process running.

---

## 4. Verification

Start the worker locally to ensure it connects to Redis without errors.

```bash
# In apps/worker
cd apps/worker  # go to the worker folder if not already there
npx tsx src/index.ts

```

**Expected Output:**

```text
🚀 Worker Service is running and listening on queue...

```
