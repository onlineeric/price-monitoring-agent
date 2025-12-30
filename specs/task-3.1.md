# Technical Spec: Phase 3.1 - Scraper Service Structure

**Phase:** 3.1
**Goal:** Design the scraper architecture and implement the first extraction strategy using HTTP fetch + Cheerio for static HTML pages.
**Context:** This is the foundation of our extraction pipeline. We establish interfaces and implement the "Fast Path" - a lightweight HTML parser for simple, non-JS-rendered pages.

---

## Prerequisites

* **Task 2.3:** End-to-end queue flow verified.
* **Worker:** `apps/worker` is set up and can process jobs.
* **Node.js:** Ensure you are working in the `apps/worker` directory.

---

## Architecture Overview

### Extraction Strategy (3-Tier Fallback)

```
┌─────────────────────────────────────────────────────────────┐
│                    Extraction Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: HtmlFetcher (Fast Path)                            │
│  └─ HTTP fetch + Cheerio                                    │
│  └─ For: Static HTML, server-rendered pages                 │
│  └─ Speed: ~100-500ms                                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: PlaywrightFetcher (Robust Path) [Task 3.2]         │
│  └─ Headless browser                                        │
│  └─ For: JS-rendered pages, SPAs                            │
│  └─ Speed: ~2-5s                                            │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: AI Extraction (Smart Path) [Task 4.1]              │
│  └─ OpenAI API                                              │
│  └─ For: Complex/ambiguous structures                       │
│  └─ Speed: ~1-3s + API cost                                 │
└─────────────────────────────────────────────────────────────┘
```

### This Task Scope

We implement **Tier 1 only** in this task:
- Define the `ScraperResult` interface (shared across all tiers)
- Implement `HtmlFetcher` service
- Integrate with existing job processor

---

## Step 1: Install Dependencies (Manual Step)

**User Action:**

Install HTML parsing library in the worker app.

```bash
cd apps/worker

# Cheerio - Fast HTML parser (jQuery-like syntax)
pnpm add cheerio

# Type definitions
pnpm add -D @types/node
```

**Note:** We use `cheerio` instead of `jsdom` because:
- Smaller bundle size (~1MB vs ~10MB)
- Faster parsing (no DOM simulation)
- Sufficient for CSS selector-based extraction

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to establish the scraper service structure. Use `apps/worker` as the working directory context.

### File 2.1: `apps/worker/src/types/scraper.ts`

**Goal:** Define shared types for the extraction pipeline.

**Requirements:**

```typescript
/**
 * Result returned by any scraper implementation
 */
export interface ScraperResult {
  success: boolean;
  data?: {
    title: string | null;
    price: number | null;       // Price in cents (e.g., 1999 = $19.99)
    currency: string | null;    // ISO 4217 code (e.g., 'USD', 'EUR')
    imageUrl: string | null;
  };
  error?: string;
  method: 'html' | 'playwright' | 'ai';  // Which tier was used
}

/**
 * Configuration for scraper behavior
 */
export interface ScraperConfig {
  timeout?: number;             // Request timeout in ms (default: 10000)
  userAgent?: string;           // Custom User-Agent header
}
```

### File 2.2: `apps/worker/src/services/htmlFetcher.ts`

**Goal:** Implement the Fast Path scraper using HTTP fetch + Cheerio.

**Requirements:**

* **Imports:**
  * `import * as cheerio from 'cheerio'`
  * `import type { ScraperResult, ScraperConfig } from '../types/scraper.js'`

* **Default Config:**
  ```typescript
  const DEFAULT_CONFIG: Required<ScraperConfig> = {
    timeout: 10000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  ```

* **Main Function:** `export async function fetchAndParse(url: string, config?: ScraperConfig): Promise<ScraperResult>`

* **Logic Flow:**
  1. Merge config with defaults.
  2. Fetch URL using native `fetch()` with:
     - `User-Agent` header from config
     - `AbortController` for timeout
  3. Check response status (throw on non-2xx).
  4. Load HTML into Cheerio: `cheerio.load(html)`.
  5. Extract data using selectors (see extraction logic below).
  6. Return `ScraperResult` with `method: 'html'`.

* **Extraction Logic (Private Helper):**

  Create a helper function `extractProductData($: cheerio.CheerioAPI)` that tries multiple common selectors:

  ```typescript
  // Title extraction (priority order)
  const titleSelectors = [
    'h1[data-testid="product-title"]',
    '#productTitle',                    // Amazon
    'h1.product-title',
    'h1[itemprop="name"]',
    '.product-name h1',
    'h1'
  ];

  // Price extraction (priority order)
  const priceSelectors = [
    '[data-testid="price"]',
    '.price-current',
    '#priceblock_ourprice',             // Amazon
    '#priceblock_dealprice',            // Amazon deals
    '.product-price',
    '[itemprop="price"]',
    '.price'
  ];

  // Image extraction (priority order)
  const imageSelectors = [
    '#landingImage',                    // Amazon
    '#imgTagWrapperId img',             // Amazon
    '[data-testid="product-image"] img',
    '.product-image img',
    '[itemprop="image"]',
    '.gallery img:first'
  ];
  ```

* **Price Parsing Helper:**

  Create `parsePrice(priceText: string): { price: number; currency: string } | null`

  - Remove whitespace and common characters
  - Detect currency symbol ($, €, £, ¥) or code
  - Parse numeric value
  - Convert to cents (multiply by 100)
  - Handle formats: `$19.99`, `19,99 €`, `£19.99`, `$1,234.56`

* **Error Handling:**
  - Wrap entire function in try/catch
  - Return `{ success: false, error: message, method: 'html' }` on failure
  - Log errors for debugging

### File 2.3: `apps/worker/src/services/scraper.ts`

**Goal:** Main scraper orchestrator (currently just wraps HtmlFetcher, will add fallbacks later).

**Requirements:**

* **Imports:**
  * `import { fetchAndParse } from './htmlFetcher.js'`
  * `import type { ScraperResult } from '../types/scraper.js'`

* **Main Function:** `export async function scrapeProduct(url: string): Promise<ScraperResult>`

* **Logic (Phase 1 - Simple):**
  ```typescript
  export async function scrapeProduct(url: string): Promise<ScraperResult> {
    // For now, only use HTML fetcher
    // TODO: Add Playwright fallback (Task 3.2)
    // TODO: Add AI fallback (Task 4.1)
    return fetchAndParse(url);
  }
  ```

* **Export:** Re-export types for convenience
  ```typescript
  export type { ScraperResult, ScraperConfig } from '../types/scraper.js'
  ```

### File 2.4: Update `apps/worker/src/jobs/priceCheck.ts`

**Goal:** Integrate scraper into the job processor.

**Requirements:**

* **Imports:**
  * `import { scrapeProduct } from '../services/scraper.js'`
  * Keep existing `Job` import from `bullmq`

* **Job Data Interface:**
  ```typescript
  interface PriceCheckJobData {
    productId: string;
    url?: string;  // Optional for now, will be required when we have real products
  }
  ```

* **Updated Logic:**
  ```typescript
  export default async function priceCheckJob(job: Job<PriceCheckJobData>) {
    console.log(`[${job.id}] Processing price check for product: ${job.data.productId}`);

    // If no URL provided, skip scraping (test mode)
    if (!job.data.url) {
      console.log(`[${job.id}] No URL provided, skipping scrape (test mode)`);
      return { status: 'skipped', reason: 'no_url' };
    }

    // Run scraper
    console.log(`[${job.id}] Scraping URL: ${job.data.url}`);
    const result = await scrapeProduct(job.data.url);

    if (result.success) {
      console.log(`[${job.id}] Scrape successful:`, result.data);
      // TODO: Save to database (Task 3.3)
    } else {
      console.error(`[${job.id}] Scrape failed:`, result.error);
    }

    return result;
  }
  ```

---

## Step 3: Update API Endpoint (AI Generation Step)

**Instruction for AI:**

Update the debug trigger endpoint to accept a URL parameter for testing.

### File 3.1: Update `apps/web/app/api/debug/trigger/route.ts`

**Requirements:**

* **Updated Body Interface:**
  ```typescript
  interface TriggerBody {
    productId?: string;
    url?: string;  // Add URL support for scraper testing
  }
  ```

* **Updated Logic:**
  - Parse both `productId` and `url` from request body
  - Pass both to the job data
  - Default `productId` to `'manual-test'` if not provided

---

## Step 4: Verification (Manual Step)

**User Action:**

Test the scraper with a real URL.

### 4.1: Start Services

```bash
# Terminal 1: Redis
docker-compose up -d

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Terminal 3: Web
cd apps/web && pnpm dev
```

### 4.2: Test with a Sample URL

**PowerShell:**

```powershell
# Test with a sample product page (use any public product URL)
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "test-scrape-001", "url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"}'
```

**Bash:**

```bash
curl -X POST http://localhost:3000/api/debug/trigger \
  -H "Content-Type: application/json" \
  -d '{"productId": "test-scrape-001", "url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"}'
```

**Note:** `books.toscrape.com` is a safe sandbox site for testing web scraping.

### 4.3: Expected Worker Output

```text
[<job-id>] Processing price check for product: test-scrape-001
[<job-id>] Scraping URL: https://books.toscrape.com/...
[<job-id>] Scrape successful: { title: 'A Light in the Attic', price: 5151, currency: 'GBP', imageUrl: '...' }
[Job Completed] <job-id> - Result: { success: true, data: {...}, method: 'html' }
```

### 4.4: Test Without URL (Backward Compatibility)

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "test-no-url"}'
```

**Expected:** Worker logs "No URL provided, skipping scrape (test mode)"

---

## Step 5: Test Edge Cases (Manual Step - Optional)

### 5.1: Invalid URL

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "test-invalid", "url": "https://invalid.example.com/404"}'
```

**Expected:** Worker logs scrape failure with error message.

### 5.2: Timeout Test

Test with a slow or unresponsive URL to verify timeout handling.

---

## File Structure After Completion

```
apps/worker/src/
├── config.ts
├── index.ts
├── types/
│   └── scraper.ts          # NEW: Shared types
├── services/
│   ├── htmlFetcher.ts      # NEW: Fast path scraper
│   └── scraper.ts          # NEW: Scraper orchestrator
├── jobs/
│   └── priceCheck.ts       # UPDATED: Integrated scraper
└── queue/
    └── worker.ts
```

---

## Troubleshooting

### Issue: "fetch is not defined"

**Cause:** Node.js version < 18.

**Solution:** Upgrade to Node.js 18+ (native fetch support) or install `node-fetch`.

### Issue: Price extraction returns null

**Cause:** Page structure doesn't match our selectors.

**Solution:** This is expected for some sites. In Task 3.2, we'll add Playwright fallback. For now, log the URL for investigation.

### Issue: CORS or blocked requests

**Cause:** Some sites block non-browser requests.

**Solution:** This will be handled by Playwright in Task 3.2. The `User-Agent` header helps but doesn't work for all sites.

---

## Completion Criteria

Task 3.1 is complete when:

- [ ] `cheerio` package installed in worker
- [ ] `types/scraper.ts` defines `ScraperResult` and `ScraperConfig`
- [ ] `services/htmlFetcher.ts` implements fetch + parse logic
- [ ] `services/scraper.ts` provides the main scraper function
- [ ] `jobs/priceCheck.ts` integrates the scraper
- [ ] API endpoint accepts `url` parameter
- [ ] Worker successfully extracts data from `books.toscrape.com`
- [ ] Backward compatibility maintained (jobs without URL still work)
