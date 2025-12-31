# Technical Spec: Phase 3.3 - Database Integration (Write Path)

**Phase:** 3.3
**Goal:** Save scraped price data to the database after successful extraction.
**Context:** After the scraper extracts product data, we need to persist it. This includes inserting a new `PriceRecord` and updating the `Product.updatedAt` timestamp.

---

## Prerequisites

* **Task 3.2:** Playwright integration complete (scraper can extract data).
* **Task 1.2:** Database schema defined in `packages/db`.
* **Database:** Neon PostgreSQL accessible via `DATABASE_URL`.

---

## Architecture Context

### Current Flow (Before This Task)

```
API Trigger → BullMQ → Worker → Scraper → Log result → Done
```

### New Flow (After This Task)

```
API Trigger → BullMQ → Worker → Scraper → Save to DB → Log result → Done
                                              │
                                              ├─ Insert PriceRecord
                                              └─ Update Product.updatedAt
```

---

## Step 1: Install Database Dependency in Worker (Manual Step)

**User Action:**

The worker needs access to the shared database package.

```bash
cd apps/worker

# Add the shared db package as a workspace dependency
pnpm add @price-monitor/db --workspace
```

**Verify:** Check `apps/worker/package.json` includes:
```json
{
  "dependencies": {
    "@price-monitor/db": "workspace:*"
  }
}
```

---

## Step 2: Push Database Schema (Manual Step)

**User Action:**

Ensure the database schema is pushed to Neon PostgreSQL.

```bash
cd packages/db

# Push schema to database (creates tables if not exist)
pnpm push
```

**Verify:** Run Drizzle Studio to inspect tables:
```bash
pnpm studio
```

Expected tables: `products`, `price_records`, `alert_rules`, `run_logs`

---

## Step 3: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate/update the following files to add database write functionality.

### File 3.1: `apps/worker/src/services/database.ts`

**Goal:** Create a database service module for the worker.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, products, priceRecords, runLogs } from '@price-monitor/db';
  import { eq } from 'drizzle-orm';
  ```

* **Function 1: `savePriceRecord`**
  ```typescript
  interface SavePriceParams {
    productId: string;
    price: number;        // In cents
    currency: string;
  }

  export async function savePriceRecord(params: SavePriceParams): Promise<void>
  ```
  * Insert a new row into `price_records` table.
  * Fields: `productId`, `price`, `currency`, `scrapedAt` (default now).

* **Function 2: `updateProductTimestamp`**
  ```typescript
  export async function updateProductTimestamp(productId: string): Promise<void>
  ```
  * Update `products.updatedAt` to current timestamp.
  * Use `eq(products.id, productId)` for the WHERE clause.

* **Function 3: `logRun`**
  ```typescript
  interface LogRunParams {
    productId: string;
    status: 'SUCCESS' | 'FAILED';
    errorMessage?: string;
  }

  export async function logRun(params: LogRunParams): Promise<void>
  ```
  * Insert a new row into `run_logs` table.
  * Fields: `productId`, `status`, `errorMessage` (nullable).

* **Function 4: `getProductById`**
  ```typescript
  export async function getProductById(productId: string): Promise<Product | null>
  ```
  * Query `products` table by ID.
  * Return the product or null if not found.

### File 3.2: Update `apps/worker/src/jobs/priceCheck.ts`

**Goal:** Integrate database writes into the job processor.

**Requirements:**

* **New Imports:**
  ```typescript
  import {
    savePriceRecord,
    updateProductTimestamp,
    logRun,
    getProductById
  } from '../services/database.js';
  ```

* **Updated Logic:**

  ```typescript
  export default async function priceCheckJob(
    job: Job<PriceCheckJobData>
  ): Promise<PriceCheckResult> {
    const { productId, url } = job.data;
    console.log(`[${job.id}] Processing price check for product: ${productId}`);

    // If no URL provided, try to get it from the database
    let targetUrl = url;
    if (!targetUrl) {
      const product = await getProductById(productId);
      if (product) {
        targetUrl = product.url;
      }
    }

    // Still no URL? Skip.
    if (!targetUrl) {
      console.log(`[${job.id}] No URL provided or found, skipping`);
      await logRun({ productId, status: 'FAILED', errorMessage: 'No URL available' });
      return { status: 'skipped', reason: 'no_url' };
    }

    // Run scraper
    console.log(`[${job.id}] Scraping URL: ${targetUrl}`);
    const result = await scrapeProduct(targetUrl);

    if (result.success && result.data) {
      console.log(`[${job.id}] Scrape successful:`, result.data);

      // Save to database if we have price data
      if (result.data.price !== null && result.data.currency !== null) {
        try {
          await savePriceRecord({
            productId,
            price: result.data.price,
            currency: result.data.currency,
          });
          await updateProductTimestamp(productId);
          await logRun({ productId, status: 'SUCCESS' });
          console.log(`[${job.id}] Price saved to database`);
        } catch (dbError) {
          console.error(`[${job.id}] Database error:`, dbError);
          await logRun({
            productId,
            status: 'FAILED',
            errorMessage: dbError instanceof Error ? dbError.message : 'Database error'
          });
        }
      } else {
        console.log(`[${job.id}] No price data to save`);
        await logRun({ productId, status: 'FAILED', errorMessage: 'No price extracted' });
      }
    } else {
      console.error(`[${job.id}] Scrape failed:`, result.error);
      await logRun({ productId, status: 'FAILED', errorMessage: result.error });
    }

    return result;
  }
  ```

* **Key Changes:**
  1. Look up product URL from database if not provided in job data.
  2. Save `PriceRecord` on successful scrape with price.
  3. Update `Product.updatedAt` timestamp.
  4. Log run status (SUCCESS/FAILED) to `run_logs`.
  5. Handle database errors gracefully.

---

## Step 4: Create Test Product (Manual Step)

**User Action:**

Before testing, we need a product in the database. Use Drizzle Studio or a SQL client.

### Option A: Using Drizzle Studio

```bash
cd packages/db
pnpm studio
```

In Drizzle Studio, insert a row into `products`:
- `id`: Generate a UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- `url`: `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`
- `name`: `A Light in the Attic`
- `active`: `true`
- `schedule`: `0 9 * * *`

### Option B: Using SQL (via Neon Console)

```sql
INSERT INTO products (id, url, name, active, schedule)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
  'A Light in the Attic',
  true,
  '0 9 * * *'
);
```

### Option C: Create a Seed Script (AI Generation Step - Optional)

**File:** `packages/db/src/seed.ts`

```typescript
import { db, products } from './index.js';

async function seed() {
  console.log('Seeding database...');

  await db.insert(products).values({
    url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    name: 'A Light in the Attic',
    active: true,
    schedule: '0 9 * * *',
  });

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(console.error);
```

Run with: `npx tsx packages/db/src/seed.ts`

---

## Step 5: Verification (Manual Step)

### 5.1: Start Services

```bash
# Terminal 1: Redis
docker-compose up -d

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Terminal 3: Web
cd apps/web && pnpm dev
```

### 5.2: Trigger Job with Product ID

Use the product ID from Step 4:

**PowerShell:**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "550e8400-e29b-41d4-a716-446655440000"}'
```

**Note:** No `url` in the body - the worker should fetch it from the database.

### 5.3: Verify Worker Output

Expected logs:

```text
[<job-id>] Processing price check for product: 550e8400-e29b-41d4-a716-446655440000
[<job-id>] Scraping URL: https://books.toscrape.com/...
[Scraper] Trying HTML fetcher for: https://books.toscrape.com/...
[Scraper] HTML fetcher succeeded
[<job-id>] Scrape successful: { title: '...', price: 5151, currency: 'GBP', ... }
[<job-id>] Price saved to database
[Job Completed] <job-id>
```

### 5.4: Verify Database Records

Open Drizzle Studio and check:

1. **`price_records` table:** New row with `productId`, `price`, `currency`, `scrapedAt`.
2. **`products` table:** `updatedAt` column updated to recent timestamp.
3. **`run_logs` table:** New row with `status: 'SUCCESS'`.

```bash
cd packages/db
pnpm studio
```

### 5.5: Test Failure Scenario

Trigger a job with an invalid product ID:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "non-existent-id"}'
```

**Expected:**
- Worker logs: "No URL provided or found, skipping"
- `run_logs` table: New row with `status: 'FAILED'`, `errorMessage: 'No URL available'`

---

## File Structure After Completion

```
apps/worker/src/
├── config.ts
├── index.ts
├── types/
│   └── scraper.ts
├── utils/
│   └── priceParser.ts
├── services/
│   ├── database.ts         # NEW: Database operations
│   ├── htmlFetcher.ts
│   ├── playwrightFetcher.ts
│   └── scraper.ts
├── jobs/
│   └── priceCheck.ts       # UPDATED: DB integration
└── queue/
    └── worker.ts
```

---

## Troubleshooting

### Issue: "Cannot find module '@price-monitor/db'"

**Cause:** Workspace dependency not installed.

**Solution:**
```bash
cd apps/worker
pnpm add @price-monitor/db --workspace
```

### Issue: "relation 'products' does not exist"

**Cause:** Database schema not pushed.

**Solution:**
```bash
cd packages/db
pnpm push
```

### Issue: Foreign key constraint error

**Cause:** Trying to insert `PriceRecord` with non-existent `productId`.

**Solution:** Ensure the product exists in `products` table first.

### Issue: "invalid input syntax for type uuid"

**Cause:** Product ID is not a valid UUID format.

**Solution:** Use proper UUID format (e.g., `550e8400-e29b-41d4-a716-446655440000`).

---

## Completion Criteria

Task 3.3 is complete when:

- [ ] `@price-monitor/db` added to worker dependencies
- [ ] Database schema pushed to Neon (`pnpm push`)
- [ ] `services/database.ts` created with CRUD functions
- [ ] `priceCheck.ts` saves data on successful scrape
- [ ] Test product created in database
- [ ] Job triggered by product ID (URL fetched from DB)
- [ ] `price_records` table has new entries after scrape
- [ ] `run_logs` table tracks success/failure
- [ ] `products.updatedAt` updated on successful scrape
