# Technical Spec: Phase 3.2 - Playwright Integration

**Phase:** 3.2
**Goal:** Implement the "Robust Path" scraper using Playwright for JavaScript-rendered pages.
**Context:** Many modern e-commerce sites use client-side rendering (React, Vue, etc.). When the HTML fetcher fails to extract data, we fall back to a headless browser that executes JavaScript.

---

## Prerequisites

* **Task 3.1:** HTML fetcher implemented and working.
* **Worker:** `apps/worker` can process jobs with scraper integration.
* **Docker:** Docker Desktop running (for testing container compatibility).

---

## Architecture Context

### Extraction Pipeline (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│                    Extraction Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: HtmlFetcher (Fast Path) ✅ Done                    │
│  └─ HTTP fetch + Cheerio                                    │
│  └─ Speed: ~100-500ms                                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: PlaywrightFetcher (Robust Path) ← THIS TASK        │
│  └─ Headless Chromium browser                               │
│  └─ For: JS-rendered pages, SPAs, anti-bot protected sites  │
│  └─ Speed: ~2-5s                                            │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: AI Extraction (Smart Path) [Task 4.1]              │
│  └─ OpenAI API                                              │
│  └─ Speed: ~1-3s + API cost                                 │
└─────────────────────────────────────────────────────────────┘
```

### Fallback Strategy

```
scrapeProduct(url)
  │
  ├─► Try HtmlFetcher
  │     ├─► Success? Return result
  │     └─► Failed? Continue ↓
  │
  ├─► Try PlaywrightFetcher  ← NEW
  │     ├─► Success? Return result
  │     └─► Failed? Continue ↓
  │
  └─► (Future) Try AI Extraction
```

---

## Step 1: Install Dependencies (Manual Step)

**User Action:**

Install Playwright in the worker app.

```bash
cd apps/worker

# Install Playwright library
pnpm add playwright

# Install browser binaries (Chromium only to save space)
npx playwright install chromium
```

**Note on Browser Installation:**
- Playwright downloads browser binaries to a cache folder (~300MB for Chromium).
- In production Docker, we'll use a pre-built image with browsers included.
- For local dev, this one-time download is required.

**Verify Installation:**

```bash
npx playwright --version
```

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate/update the following files to add Playwright-based extraction.

### File 2.1: `apps/worker/src/services/playwrightFetcher.ts`

**Goal:** Implement the Robust Path scraper using Playwright.

**Requirements:**

* **Imports:**
  ```typescript
  import { chromium, type Browser, type Page } from 'playwright';
  import type { ScraperResult, ScraperConfig } from '../types/scraper.js';
  ```

* **Browser Management:**
  - Use a singleton browser instance to avoid repeated startup costs.
  - Lazy initialization: create browser only when first needed.
  - Provide cleanup function for graceful shutdown.

  ```typescript
  let browserInstance: Browser | null = null;

  async function getBrowser(): Promise<Browser> {
    if (!browserInstance) {
      browserInstance = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',  // Important for Docker
          '--disable-gpu',
        ],
      });
    }
    return browserInstance;
  }

  export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
  }
  ```

* **Default Config:**
  ```typescript
  const DEFAULT_CONFIG: Required<ScraperConfig> = {
    timeout: 30000,  // Longer timeout for browser rendering
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
  };
  ```

* **Main Function:** `export async function playwrightFetch(url: string, config?: ScraperConfig): Promise<ScraperResult>`

* **Logic Flow:**
  1. Get browser instance.
  2. Create new page with custom user agent.
  3. Set viewport (1280x720).
  4. Navigate to URL with `waitUntil: 'networkidle'` (wait for JS to finish).
  5. Wait additional 1-2 seconds for dynamic content.
  6. Extract data using `page.evaluate()` (runs in browser context).
  7. Close page (not browser).
  8. Return `ScraperResult` with `method: 'playwright'`.

* **Extraction Logic (In-Browser):**

  Use `page.evaluate()` to run extraction in the browser context:

  ```typescript
  const data = await page.evaluate(() => {
    // Title selectors
    const titleSelectors = [
      'h1[data-testid="product-title"]',
      '#productTitle',
      'h1.product-title',
      'h1[itemprop="name"]',
      'h1',
    ];

    // Price selectors
    const priceSelectors = [
      '[data-testid="price"]',
      '#priceblock_ourprice',
      '.a-price .a-offscreen',
      '[itemprop="price"]',
      '.price',
    ];

    // Image selectors
    const imageSelectors = [
      '#landingImage',
      '[data-testid="product-image"] img',
      '[itemprop="image"]',
      '.product-image img',
    ];

    // Helper to find first matching element
    const findFirst = (selectors: string[]): Element | null => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    };

    // Extract data
    const titleEl = findFirst(titleSelectors);
    const priceEl = findFirst(priceSelectors);
    const imageEl = findFirst(imageSelectors) as HTMLImageElement | null;

    return {
      title: titleEl?.textContent?.trim() || null,
      priceText: priceEl?.textContent?.trim() || null,
      imageUrl: imageEl?.src || imageEl?.getAttribute('data-src') || null,
    };
  });
  ```

* **Price Parsing:**
  - Reuse the same `parsePrice()` logic from `htmlFetcher.ts`.
  - Consider extracting to a shared utility in `types/scraper.ts` or a new `utils/` folder.

* **Error Handling:**
  - Wrap in try/catch/finally.
  - Always close the page in `finally` block.
  - Return `{ success: false, error: message, method: 'playwright' }` on failure.
  - Handle navigation timeout specifically.

### File 2.2: Update `apps/worker/src/services/scraper.ts`

**Goal:** Add Playwright as fallback in the orchestrator.

**Requirements:**

* **Import:** Add `import { playwrightFetch } from './playwrightFetcher.js'`

* **Updated Logic:**
  ```typescript
  export async function scrapeProduct(url: string): Promise<ScraperResult> {
    // Tier 1: Try HTML fetcher first (fast path)
    console.log(`[Scraper] Trying HTML fetcher for: ${url}`);
    const htmlResult = await fetchAndParse(url);

    if (htmlResult.success) {
      console.log(`[Scraper] HTML fetcher succeeded`);
      return htmlResult;
    }

    // Tier 2: Fall back to Playwright (robust path)
    console.log(`[Scraper] HTML failed, trying Playwright for: ${url}`);
    const playwrightResult = await playwrightFetch(url);

    if (playwrightResult.success) {
      console.log(`[Scraper] Playwright succeeded`);
      return playwrightResult;
    }

    // TODO: Add AI fallback (Task 4.1)

    // Return last error if all tiers fail
    console.log(`[Scraper] All methods failed for: ${url}`);
    return playwrightResult;
  }
  ```

### File 2.3: Update `apps/worker/src/index.ts`

**Goal:** Add graceful shutdown to close the browser.

**Requirements:**

* **Import:** `import { closeBrowser } from './services/playwrightFetcher.js'`

* **Add Shutdown Handler:**
  ```typescript
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closeBrowser();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await closeBrowser();
    process.exit(0);
  });
  ```

---

## Step 3: Shared Price Parser (AI Generation Step - Optional Refactor)

**Instruction for AI:**

To avoid code duplication, extract the price parsing logic into a shared utility.

### File 3.1: `apps/worker/src/utils/priceParser.ts`

**Goal:** Shared utility for parsing price strings.

**Requirements:**

* Move the `parsePrice()` function and `CURRENCY_MAP` from `htmlFetcher.ts`.
* Export as named export.
* Update both `htmlFetcher.ts` and `playwrightFetcher.ts` to import from this utility.

---

## Step 4: Verification (Manual Step)

### 4.1: Start Services

```bash
# Terminal 1: Redis
docker-compose up -d

# Terminal 2: Worker
cd apps/worker && pnpm dev

# Terminal 3: Web
cd apps/web && pnpm dev
```

### 4.2: Test with a JS-Rendered Site

Many modern sites require JavaScript. Test with a site that the HTML fetcher fails on:

**PowerShell:**

```powershell
# Test with a known JS-rendered page
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "playwright-test-001", "url": "https://www.example.com/some-product"}'
```

**Note:** Finding a good test URL can be tricky. Options:
1. Use a SPA demo site that requires JS.
2. Check worker logs to see which tier was used (`method: 'html'` vs `method: 'playwright'`).

### 4.3: Verify Fallback Behavior

The worker logs should show the fallback sequence:

```text
[Scraper] Trying HTML fetcher for: https://...
[Scraper] HTML failed, trying Playwright for: https://...
[Scraper] Playwright succeeded
[<job-id>] Scrape successful: { title: '...', price: 1999, ... }
```

### 4.4: Test Browser Singleton

Send multiple requests in quick succession to verify browser reuse:

```powershell
1..3 | ForEach-Object {
  Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
    -Method POST `
    -ContentType "application/json" `
    -Body "{`"productId`": `"browser-test-$_`", `"url`": `"https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`"}"
}
```

The browser should only launch once (check for single "Launching browser..." log).

### 4.5: Test Graceful Shutdown

1. Start the worker.
2. Trigger a job to initialize the browser.
3. Press `Ctrl+C` in the worker terminal.
4. Verify "Shutting down..." is logged and process exits cleanly.

---

## Step 5: Docker Compatibility Notes (Reference)

For production deployment (Task 7.1), the Dockerfile will need:

```dockerfile
# Use Playwright's official base image
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Or install manually:
# RUN npx playwright install-deps chromium
# RUN npx playwright install chromium
```

**Key Docker considerations:**
- Use `--no-sandbox` flag (already in our launch args).
- Use `--disable-dev-shm-usage` to avoid shared memory issues.
- Pre-install browser in Docker image to avoid runtime downloads.

---

## File Structure After Completion

```
apps/worker/src/
├── config.ts
├── index.ts                    # UPDATED: graceful shutdown
├── types/
│   └── scraper.ts
├── utils/
│   └── priceParser.ts          # NEW: shared utility
├── services/
│   ├── htmlFetcher.ts          # UPDATED: use shared parser
│   ├── playwrightFetcher.ts    # NEW: robust path
│   └── scraper.ts              # UPDATED: fallback logic
├── jobs/
│   └── priceCheck.ts
└── queue/
    └── worker.ts
```

---

## Troubleshooting

### Issue: "Executable doesn't exist" or "browserType.launch"

**Cause:** Playwright browsers not installed.

**Solution:**
```bash
cd apps/worker
npx playwright install chromium
```

### Issue: Browser crashes in Docker/WSL

**Cause:** Missing system dependencies or sandbox issues.

**Solution:** Ensure launch args include:
```typescript
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
```

### Issue: Timeout waiting for navigation

**Cause:** Page takes too long to load or has infinite loading state.

**Solution:**
- Increase timeout in config.
- Use `waitUntil: 'domcontentloaded'` instead of `'networkidle'` for faster (but less complete) loads.

### Issue: Memory usage grows over time

**Cause:** Pages not being closed properly.

**Solution:** Ensure `page.close()` is in a `finally` block.

---

## Completion Criteria

Task 3.2 is complete when:

- [ ] Playwright installed in worker (`pnpm add playwright`)
- [ ] Chromium browser installed (`npx playwright install chromium`)
- [ ] `playwrightFetcher.ts` implements browser-based extraction
- [ ] `scraper.ts` orchestrates HTML → Playwright fallback
- [ ] `index.ts` handles graceful browser shutdown
- [ ] Worker logs show correct tier being used
- [ ] Browser singleton works (launches once, reused across jobs)
- [ ] Graceful shutdown closes browser cleanly
