# Technical Spec: Task 4.1 Enhancement - Schema Updates for Digest Email System

**Phase:** 4.1 Enhancement
**Goal:** Update database schema and existing code to support digest email system instead of individual price alerts.
**Context:** We're changing from individual price drop alerts to a consolidated digest email system. This requires schema changes to remove alert-related tables and add email scheduling configuration.

---

## Prerequisites

* **Task 4.1:** AI extraction complete.
* **Task 3.3:** Database integration complete.
* All existing code up to Task 4.1 is working.

---

## Architecture Context

### What's Changing

**OLD Architecture (Individual Alerts):**
- Each product has `alertRules` with target prices
- Worker checks price → if below target → send individual email
- 5 products = potentially 5 separate emails

**NEW Architecture (Digest Email):**
- No per-product alerts or target prices
- One scheduled digest email with ALL products
- Email shows price trends and comparison data
- Triggered by: Dashboard button OR scheduled cron

### Schema Changes Overview

1. **Remove:** `alertRules` table (no longer needed)
2. **Remove:** `products.schedule` column (moving to global settings in task 4.2)
3. **Add:** `products.last_success_at` timestamp (track last successful scrape)
4. **Add:** `products.last_failed_at` timestamp (track last failed scrape)

---

## Step 1: Database Schema Changes (AI Generation Step)

**Instruction for AI:**

Update the database schema to remove alert functionality and add success/failure tracking.

### 1.1: Update `packages/db/src/schema.ts`

**Remove `alertRules` table and relations:**

Delete the entire `alertRules` table definition (lines 34-43) and its relations (lines 57, 68-73).

**Update `products` table:**

```typescript
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull().unique(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  active: boolean('active').default(true),
  // REMOVED: schedule column
  lastSuccessAt: timestamp('last_success_at'), // NEW: track last successful scrape
  lastFailedAt: timestamp('last_failed_at'),   // NEW: track last failed scrape
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Update relations:**

```typescript
export const productsRelations = relations(products, ({ many }) => ({
  priceRecords: many(priceRecords),
  // REMOVED: alertRules relation
  runLogs: many(runLogs),
}));

// REMOVED: alertRulesRelations
```

### 1.2: Update exports in `packages/db/src/index.ts`

```typescript
export { products, priceRecords, runLogs } from './schema.js';
// REMOVED: alertRules
```

---

## Step 2: Generate Migration (Manual Step)

**User Action:**

```bash
cd packages/db
pnpm generate
```

This creates a new migration file in `drizzle/` folder.

---

## Step 3: Review Migration (Manual Step)

**User Action:**

Open the generated migration file and verify it includes:
- `DROP TABLE alert_rules;`
- `ALTER TABLE products DROP COLUMN schedule;`
- `ALTER TABLE products ADD COLUMN last_success_at timestamp;`
- `ALTER TABLE products ADD COLUMN last_failed_at timestamp;`

---

## Step 4: Apply Migration (Manual Step)

**User Action:**

```bash
pnpm push
```

**Warning:** This will delete the `alert_rules` table and all existing alert data. Make sure this is intentional before proceeding.

---

## Step 5: Update Existing Code (AI Generation Step)

**Instruction for AI:**

Update the worker code to remove alert functionality and add success/failure tracking.

### 5.1: Update `apps/worker/src/services/database.ts`

**Remove alert-related functions:**

Delete:
- `createAlertRule()` function (if it exists)
- Any imports of `alertRules` from schema

**Update `updateProductTimestamp()` function:**

```typescript
export async function updateProductTimestamp(productId: string): Promise<void> {
  await db
    .update(products)
    .set({
      lastSuccessAt: new Date(),  // Changed from updatedAt
      updatedAt: new Date()
    })
    .where(eq(products.id, productId));
}
```

**Add new function for failed scrapes:**

```typescript
export async function updateProductFailure(productId: string): Promise<void> {
  await db
    .update(products)
    .set({
      lastFailedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(products.id, productId));
}
```

### 5.2: Update `apps/worker/src/jobs/priceCheck.ts`

**Update error handling to use `updateProductFailure()`:**

```typescript
import { updateProductFailure } from '../services/database.js';

// In the catch block for extraction errors:
catch (error) {
  console.error(`[${job.id}] Scrape failed:`, error);

  await updateProductFailure(productId);  // NEW: track failure time

  await logRun({
    productId,
    status: 'FAILED',
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
  });

  throw error;
}
```

---

## Step 6: Verification (Manual Step)

**User Action:**

### 6.1: Verify Schema Changes

```bash
cd packages/db
pnpm studio
```

Check that:
- [x] `alert_rules` table no longer exists
- [x] `products` table has `last_success_at` and `last_failed_at` columns
- [x] `products` table does NOT have `schedule` column

### 6.2: Test Success Tracking

Trigger a price check job and verify:
- Successful scrape updates `products.last_success_at`
- Failed scrape updates `products.last_failed_at`

---

## Completion Criteria

Task 4.1 Enhancement is complete when:

- [ ] `alertRules` table dropped from schema and database
- [ ] `products.schedule` column removed
- [ ] `products.last_success_at` column added
- [ ] `products.last_failed_at` column added
- [ ] Migration generated and applied successfully
- [ ] `database.ts` updated with `updateProductTimestamp()` and `updateProductFailure()`
- [ ] `priceCheck.ts` uses `updateProductFailure()` on errors
- [ ] All verification tests pass
- [ ] No import errors or TypeScript errors

---

## Notes

- This is a **breaking change** - all existing alert rules will be deleted
- Existing code that references `alertRules` will need to be removed/updated
- `last_success_at` vs `last_failed_at` comparison determines if last scrape failed (used in digest email)
