# Technical Spec: Phase 6.1 - Trend Calculation Service

**Phase:** 6.1
**Goal:** Create a service that calculates price trends (7/30/90/180 day averages and percentage changes) for all products.
**Context:** The digest email needs trend data to show how current prices compare to historical averages and last check. This service queries price records and calculates statistics that will be used in email generation.

---

## Prerequisites

* **Task 4.2:** Email infrastructure and settings complete.
* **Database:** Products and price records with historical data.

---

## Architecture Context

### Trend Calculation Overview

**Data Points Calculated:**
- 7-day average price
- 30-day average price
- 90-day average price
- 180-day average price
- Percentage change from last check
- Percentage change vs each average

**Edge Cases:**
- Products with insufficient data (< X days of history)
- Products that have never been successfully scraped
- Products that failed on last scrape

**Performance:**
- Calculates trends for ALL products in single operation
- Uses efficient date range queries
- Returns formatted data ready for email template

---

## Step 1: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following file to implement trend calculation service.

### File 1.1: `apps/worker/src/services/trendCalculator.ts`

**Goal:** Calculate price trends and statistics for products.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, products, priceRecords } from '@price-monitor/db';
  import { eq, gte, desc } from 'drizzle-orm';
  import { subDays } from 'date-fns';
  ```

* **Type Definitions:**
  ```typescript
  export interface ProductTrendData {
    productId: string;
    name: string;
    url: string;
    imageUrl: string | null;
    currentPrice: number | null;
    currency: string | null;
    lastChecked: Date | null;
    lastFailed: Date | null;
    // Last check comparison
    previousPrice: number | null;
    vsLastCheck: number | null; // Percentage change
    // Average comparisons
    avg7d: number | null;
    vs7dAvg: number | null;
    avg30d: number | null;
    vs30dAvg: number | null;
    avg90d: number | null;
    vs90dAvg: number | null;
    avg180d: number | null;
    vs180dAvg: number | null;
  }
  ```

* **Helper: Calculate Average:**
  ```typescript
  function calculateAverage(prices: number[]): number | null {
    if (prices.length === 0) return null;
    const sum = prices.reduce((a, b) => a + b, 0);
    return Math.round(sum / prices.length);
  }
  ```

* **Helper: Calculate Percentage Change:**
  ```typescript
  function calculatePercentageChange(
    current: number | null,
    previous: number | null
  ): number | null {
    if (current === null || previous === null || previous === 0) {
      return null;
    }
    return ((current - previous) / previous) * 100;
  }
  ```

* **Main Function:**
  ```typescript
  export async function calculateTrendsForAllProducts(): Promise<ProductTrendData[]>
  ```

* **Implementation Logic:**
  ```typescript
  export async function calculateTrendsForAllProducts(): Promise<ProductTrendData[]> {
    console.log('[Trend Calculator] Calculating trends for all products...');

    // Get all active products
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.active, true));

    console.log(`[Trend Calculator] Found ${allProducts.length} active products`);

    // Calculate trends for each product
    const trendsData = await Promise.all(
      allProducts.map(async (product) => {
        // Get latest price
        const [latestPrice] = await db
          .select()
          .from(priceRecords)
          .where(eq(priceRecords.productId, product.id))
          .orderBy(desc(priceRecords.scrapedAt))
          .limit(1);

        // Get previous price (second most recent)
        const [previousPrice] = await db
          .select()
          .from(priceRecords)
          .where(eq(priceRecords.productId, product.id))
          .orderBy(desc(priceRecords.scrapedAt))
          .limit(1)
          .offset(1);

        // Get price history for different time periods
        const now = new Date();
        const periods = [
          { days: 7, label: '7d' },
          { days: 30, label: '30d' },
          { days: 90, label: '90d' },
          { days: 180, label: '180d' },
        ];

        const averages: Record<string, number | null> = {};
        const vsAverages: Record<string, number | null> = {};

        for (const period of periods) {
          const startDate = subDays(now, period.days);

          const records = await db
            .select()
            .from(priceRecords)
            .where(
              eq(priceRecords.productId, product.id),
              gte(priceRecords.scrapedAt, startDate)
            );

          const prices = records.map(r => r.price);
          const avg = calculateAverage(prices);

          averages[`avg${period.label}`] = avg;
          vsAverages[`vs${period.label}Avg`] = calculatePercentageChange(
            latestPrice?.price || null,
            avg
          );
        }

        // Calculate vs last check
        const vsLastCheck = calculatePercentageChange(
          latestPrice?.price || null,
          previousPrice?.price || null
        );

        return {
          productId: product.id,
          name: product.name,
          url: product.url,
          imageUrl: product.imageUrl,
          currentPrice: latestPrice?.price || null,
          currency: latestPrice?.currency || null,
          lastChecked: product.lastSuccessAt,
          lastFailed: product.lastFailedAt,
          previousPrice: previousPrice?.price || null,
          vsLastCheck,
          avg7d: averages.avg7d,
          vs7dAvg: vsAverages.vs7dAvg,
          avg30d: averages.avg30d,
          vs30dAvg: vsAverages.vs30dAvg,
          avg90d: averages.avg90d,
          vs90dAvg: vsAverages.vs90dAvg,
          avg180d: averages.avg180d,
          vs180dAvg: vsAverages.vs180dAvg,
        } as ProductTrendData;
      })
    );

    console.log('[Trend Calculator] Trends calculated for all products');
    return trendsData;
  }
  ```

* **Optional: Get Trends for Single Product:**
  ```typescript
  export async function calculateTrendsForProduct(productId: string): Promise<ProductTrendData | null> {
    console.log(`[Trend Calculator] Calculating trends for product ${productId}...`);

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      console.error(`[Trend Calculator] Product not found: ${productId}`);
      return null;
    }

    // Same logic as above but for single product
    // (can extract to shared helper function to avoid duplication)

    // ... (implementation similar to the loop body above)

    return null; // Implement if needed
  }
  ```

---

## Step 2: Create Test Script (AI Generation Step)

**Instruction for AI:**

Create a test script to verify trend calculation.

### File 2.1: `apps/worker/src/test-trends.ts`

**Goal:** Test script to run trend calculator and display results.

**Requirements:**

```typescript
import { calculateTrendsForAllProducts } from './services/trendCalculator.js';

async function test() {
  console.log('Testing trend calculator...\n');

  const trends = await calculateTrendsForAllProducts();

  console.log(`\nCalculated trends for ${trends.length} products:\n`);

  trends.forEach((trend) => {
    console.log(`Product: ${trend.name}`);
    console.log(`  Current Price: ${trend.currentPrice ? (trend.currentPrice / 100).toFixed(2) : 'N/A'} ${trend.currency || ''}`);
    console.log(`  Last Checked: ${trend.lastChecked || 'Never'}`);
    console.log(`  vs Last Check: ${trend.vsLastCheck ? trend.vsLastCheck.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 7d Avg: ${trend.vs7dAvg ? trend.vs7dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 30d Avg: ${trend.vs30dAvg ? trend.vs30dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 90d Avg: ${trend.vs90dAvg ? trend.vs90dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 180d Avg: ${trend.vs180dAvg ? trend.vs180dAvg.toFixed(1) + '%' : 'N/A'}`);

    if (trend.lastFailed && trend.lastChecked && trend.lastFailed > trend.lastChecked) {
      console.log(`  ⚠️ Last update FAILED`);
    }

    console.log('');
  });
}

test().catch(console.error);
```

---

## Step 3: Verification (Manual Step)

### 3.1: Run Test Script

```bash
cd apps/worker
npx tsx src/test-trends.ts
```

### 3.2: Verify Output

Check that the output shows:
- [x] All active products listed
- [x] Current prices display correctly
- [x] Last checked timestamps are accurate
- [x] Percentage changes calculate correctly
- [x] Products with insufficient data show "N/A"
- [x] Failed products show warning indicator

### 3.3: Verify Edge Cases

**Products with no price history:**
- Should show `currentPrice: null`
- All trends should be `null`

**Products with only 1 price record:**
- `currentPrice` should show
- `vsLastCheck` should be `null` (no previous)
- Averages should equal current price
- vs averages should be 0% or close to 0%

**Products with < 7 days of data:**
- 7d average: calculated from available data
- 30d/90d/180d averages: calculated from available data (not enough data, but still calculates)

**Products that failed last scrape:**
- Should show `lastFailed > lastChecked`
- Test script should display warning

### 3.4: Performance Check

For databases with many products, verify:
- Calculation completes in reasonable time (< 5 seconds for 50 products)
- No memory issues
- Database queries are efficient (check logs)

---

## File Structure After Completion

```
apps/worker/src/
├── config.ts
├── index.ts
├── test-trends.ts              # NEW: Test script
├── types/
│   └── scraper.ts
├── utils/
│   └── priceParser.ts
├── emails/
│   └── PriceDigest.tsx
├── services/
│   ├── aiExtractor.ts
│   ├── database.ts
│   ├── emailService.ts
│   ├── htmlFetcher.ts
│   ├── playwrightFetcher.ts
│   ├── scraper.ts
│   ├── settingsService.ts
│   └── trendCalculator.ts     # NEW: Trend calculation service
├── jobs/
│   └── priceCheck.ts
└── queue/
    └── worker.ts
```

---

## Performance Optimization Notes

**Current Implementation:**
- Queries database multiple times per product (1 + 1 + 4 per product)
- For 50 products: ~300 queries

**Future Optimizations (Out of Scope):**
- Batch queries using SQL joins
- Cache averages in database
- Use database aggregation functions (AVG, etc.)
- Materialize trend data in separate table

For initial implementation, the simpler approach is acceptable for < 100 products.

---

## Troubleshooting

### Issue: Percentages showing as NaN

**Cause:** Division by zero or null values.

**Solution:** The `calculatePercentageChange` helper should handle null checks. Verify it returns `null` for invalid inputs.

### Issue: Averages not calculating

**Cause:** No price records in time period or date filtering issue.

**Solution:** Check that `gte(priceRecords.scrapedAt, startDate)` is correctly filtering records. Verify dates are valid Date objects.

### Issue: Very slow performance

**Cause:** Too many database queries for large product lists.

**Solution:** Consider implementing batch queries or database-level aggregations. For now, acceptable for < 100 products.

---

## Completion Criteria

Task 6.1 is complete when:

- [ ] `trendCalculator.ts` service created
- [ ] `calculateTrendsForAllProducts()` function implemented
- [ ] Test script runs successfully
- [ ] Trends calculate correctly for all products
- [ ] Edge cases handled (no data, insufficient data, failed products)
- [ ] Percentage changes calculate correctly
- [ ] Averages calculate correctly
- [ ] No TypeScript errors
- [ ] Performance is acceptable (< 5 sec for typical product count)

---

## Notes

- This service is stateless - it calculates on-demand, doesn't store trends
- Trends are calculated fresh each time the digest email is sent
- The trend data structure matches the email template props from Phase 4.2
- Calculation happens in the worker (not the web app) to keep API responses fast
- Future enhancement: Cache calculated trends to improve performance
