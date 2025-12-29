# Technical Spec: Phase 2.2 - Web Producer Setup

**Phase:** 2.2
**Goal:** Configure `apps/web` (Next.js) to act as a BullMQ Producer.
**Context:** Next.js serves as the interface to trigger background jobs. We need to handle Next.js specific behaviors like Hot Reloading (Singleton Pattern) and Root Environment Variable loading.

## Prerequisites

* **Worker:** Ensure `apps/worker` is set up.
* **Redis:** Ensure local Redis is running (`docker-compose up -d`).
* **Directory:** All commands should be run in `apps/web` unless specified otherwise.

---

## Step 1: Install Dependencies (Manual Step)

**User Action:**  
**Install Dependencies:**  
```bash
cd apps/web
pnpm add bullmq ioredis
pnpm add -D dotenv
```

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**
Generate the following 3 files to configure the Web App as a Job Producer. Use `apps/web` as the working directory context.

### File 2.1: `apps/web/next.config.ts`
* **Goal:** Configure Next.js to load environment variables from the Monorepo Root.
* **Requirements:**
    * Import `dotenv`, `path`, and `{ fileURLToPath }` from 'url'.
    * **Path Resolution (ESM Native):**
        * Define `__filename = fileURLToPath(import.meta.url)`.
        * Define `__dirname = path.dirname(__filename)`.
    * **Logic:**
        * Define `envPath` using `path.resolve(__dirname, "../../.env")`.
        * Initialize `dotenv.config({ path: envPath })` *before* the config export.
    * **Config Object:** Keep the default `nextConfig` structure intact.

### File 2.2: `apps/web/lib/queue.ts`
* **Goal:** Create a **Singleton** instance of the BullMQ `Queue`.
* **Requirements:**
    * Import `{ Queue }` from `bullmq`.
    * Import `{ Redis }` from `ioredis` (use named import, not default).
    * Define `QUEUE_NAME` = `'price-monitor-queue'` (Must match Worker!).
    * **Singleton Logic:**
        * To support Next.js Hot Reload, attach the queue instance to `globalThis`.
        * Interface: `interface GlobalWithQueue { priceQueue: Queue | undefined }`.
        * Check if `globalThis.priceQueue` exists. If not, create a new instance.
        * **Connection:** Create `new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })` and pass it to Queue's `connection` option.
        * Save to `globalThis` if not in production.
    * **Export:** `export const priceQueue`.

### File 2.3: `apps/web/app/api/debug/trigger/route.ts`
* **Goal:** Internal API to trigger a job.
* **Type:** Next.js App Router Route Handler (`POST`).
* **Requirements:**
    * **Import:** `import { priceQueue } from "@/lib/queue";` (Using Alias).
    * **Logic:**
        * Parse request body for `productId` (default `'manual-test'`).
        * Call `await priceQueue.add('check-price', { ... })`.
        * Return JSON: `{ success: true, jobId, message: 'Job enqueued' }`.

---

## Step 3: Verification (Manual Step)

**User Action:**

1.  **Start Worker:**
    ```bash
    # Terminal 1 (apps/worker)
    pnpm dev
    ```
    *(Verify it says "Worker Service is running...")*

2.  **Start Web:**
    ```bash
    # Terminal 2 (apps/web)
    pnpm dev
    ```

3.  **Trigger Job:**
    ```bash
    curl -X POST http://localhost:3000/api/debug/trigger \
    -H "Content-Type: application/json" \
    -d '{"productId": "test-fix-v2"}'
    ```

4.  **Expectation:**
    * **Web:** Returns `{"success":true, ...}`.
    * **Worker:** Logs `[Job Completed]`.