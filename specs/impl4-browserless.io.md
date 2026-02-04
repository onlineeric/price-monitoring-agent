# Technical Spec: BrowserQL Fallback (Tier 3 Extraction)

**Branch:** `impl4-browserless-io`
**Goal:** Add browserless.io BrowserQL as a fallback when Playwright + AI extraction fails.
**Use Case:** Some sites have strong bot detection that blocks even Playwright with stealth mode. BrowserQL runs in browserless.io's cloud infrastructure with residential proxies and better fingerprinting.

---

## Current Architecture

```
Tier 1: HTML Fetcher (Cheerio)
    ↓ (if failed or incomplete)
Tier 2: Playwright + Selectors
    ↓ (if selectors fail)
    → AI Extraction with Playwright HTML
```

**Problem:** When Playwright itself fails (timeout, bot detection page, network error), the entire extraction fails. Sites like Woolworths NZ can block local Playwright instances.

---

## Proposed Architecture

```
Tier 1: HTML Fetcher (Cheerio)
    ↓ (if failed or incomplete)
Tier 2: Playwright + Selectors → AI Extraction
    ↓ (if Tier 2 completely fails)
Tier 3: BrowserQL → AI Extraction
```

**Tier 3 triggers when:**
- Playwright fails to load page (timeout, network error)
- Playwright loads but gets bot detection page
- AI extraction on Playwright HTML returns no price/title

---

## BrowserQL Overview

BrowserQL is a GraphQL API from browserless.io that fetches and processes web pages in their cloud infrastructure.

**Authentication:** Token passed as URL query parameter (required by browserless.io)

**URL Format:**
```
{endpoint}?token={token}{proxyString}{optionsString}
```

**Example:**
```
https://production-sfo.browserless.io/stealth/bql?token=xxx&proxy=residential&proxyCountry=us&blockAds=true&blockConsentModals=true
```

---

## Implementation Steps

### Step 1: Environment Configuration

**Add to `.env.example` and `.env`:**
```env
# Browserless.io BrowserQL (Tier 3 fallback)
# All 4 variables required to enable Tier 3
BROWSERLESS_ENDPOINT=https://production-sfo.browserless.io/stealth/bql
BROWSERLESS_TOKEN=your-token-here
BROWSERLESS_PROXY_STRING=&proxy=residential&proxyCountry=us
BROWSERLESS_OPTIONS_STRING=&blockAds=true&blockConsentModals=true
BROWSERLESS_TIMEOUT=30000
```

**Environment Variable Details:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BROWSERLESS_ENDPOINT` | Yes | - | BrowserQL endpoint (e.g., `https://production-sfo.browserless.io/stealth/bql`) |
| `BROWSERLESS_TOKEN` | Yes | - | API token from browserless.io (passed via URL query param) |
| `BROWSERLESS_PROXY_STRING` | Yes | - | Proxy config (e.g., `&proxy=residential&proxyCountry=us`) |
| `BROWSERLESS_OPTIONS_STRING` | Yes | - | Additional options (e.g., `&blockAds=true&blockConsentModals=true`) |
| `BROWSERLESS_TIMEOUT` | No | `30000` | Navigation timeout in milliseconds |

---

### Step 2: Create BrowserQL Fetcher

**Create `apps/worker/src/services/browserlessFetcher.ts`:**

```typescript
import type { ScraperResult } from '../types/scraper.js';
import { aiExtract } from './aiExtractor.js';

/**
 * Get BrowserQL timeout from environment (default: 30000ms)
 */
function getTimeout(): number {
  return parseInt(process.env.BROWSERLESS_TIMEOUT || '30000', 10);
}

/**
 * Build BrowserQL GraphQL query
 * Note: URL is interpolated directly into the query string (not as a variable)
 */
function buildBQLQuery(url: string, timeout: number): string {
  return `
mutation GetPageData {
  viewport(width: 1366, height: 768) {
    width
    height
    time
  }
  goto(
    url: "${url}"
    waitUntil: load
    ,timeout: ${timeout}
  ) {
    status
  }
  pageContent: html(
    clean: {
      removeNonTextNodes: false
      removeAttributes: true
      removeRegex: true
    }
  ) {
    html
  }
}
`;
}

/**
 * Response shape from BrowserQL API
 */
interface BrowserQLResponse {
  data?: {
    viewport?: { width: number; height: number; time: number };
    goto?: { status: number };
    pageContent?: { html: string };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Check if BrowserQL is configured (all required env vars must be set)
 */
export function isBrowserlessConfigured(): boolean {
  return !!(
    process.env.BROWSERLESS_ENDPOINT &&
    process.env.BROWSERLESS_TOKEN &&
    process.env.BROWSERLESS_PROXY_STRING &&
    process.env.BROWSERLESS_OPTIONS_STRING
  );
}

/**
 * Build the full BrowserQL URL with token and options
 */
function buildBrowserlessUrl(): string {
  const endpoint = process.env.BROWSERLESS_ENDPOINT!;
  const token = process.env.BROWSERLESS_TOKEN!;
  const proxyString = process.env.BROWSERLESS_PROXY_STRING!;
  const optionsString = process.env.BROWSERLESS_OPTIONS_STRING!;

  return `${endpoint}?token=${token}${proxyString}${optionsString}`;
}

/**
 * Fetch HTML using browserless.io BrowserQL
 * Returns raw HTML string or throws error
 */
async function fetchHtmlWithBrowserQL(targetUrl: string): Promise<string> {
  if (!isBrowserlessConfigured()) {
    throw new Error('BrowserQL not configured: missing required env vars');
  }

  const timeout = getTimeout();
  const browserlessUrl = buildBrowserlessUrl();

  console.log(`[BrowserQL] Fetching: ${targetUrl}`);

  const response = await fetch(browserlessUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: buildBQLQuery(targetUrl, timeout),
      operationName: 'GetPageData',
    }),
    signal: AbortSignal.timeout(timeout + 10000), // Extra buffer for network
  });

  if (!response.ok) {
    throw new Error(`BrowserQL HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: BrowserQLResponse = await response.json();

  // Check for GraphQL errors
  if (result.errors && result.errors.length > 0) {
    throw new Error(`BrowserQL error: ${result.errors[0].message}`);
  }

  // Check navigation status
  const status = result.data?.goto?.status;
  if (status && status >= 400) {
    throw new Error(`Page returned HTTP ${status}`);
  }

  // Extract HTML
  const html = result.data?.pageContent?.html;
  if (!html) {
    throw new Error('BrowserQL returned no HTML content');
  }

  console.log(`[BrowserQL] Received ${html.length} chars`);
  return html;
}

/**
 * Tier 3 extraction: BrowserQL + AI
 *
 * Uses browserless.io's BrowserQL to fetch fully-rendered HTML,
 * then passes it to AI extractor for price/title extraction.
 */
export async function browserlessFetch(url: string): Promise<ScraperResult> {
  try {
    const html = await fetchHtmlWithBrowserQL(url);

    // Pass BrowserQL HTML to AI for extraction
    console.log(`[BrowserQL] Passing HTML to AI extractor...`);
    const aiResult = await aiExtract(url, html);

    // Update method to indicate browserless was used
    return {
      ...aiResult,
      method: 'browserless',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BrowserQL] Failed:`, errorMessage);

    return {
      success: false,
      error: `BrowserQL failed: ${errorMessage}`,
      method: 'browserless',
    };
  }
}
```

---

### Step 3: Update ScraperResult Type

**Update `apps/worker/src/types/scraper.ts`:**

```typescript
export interface ScraperResult {
  success: boolean;
  data?: {
    title: string | null;
    price: number | null;
    currency: string | null;
    imageUrl: string | null;
  };
  error?: string;
  method: 'html' | 'playwright' | 'ai' | 'browserless'; // Added 'browserless'
}
```

---

### Step 4: Update Main Scraper Orchestrator

**Update `apps/worker/src/services/scraper.ts`:**

```typescript
import { fetchAndParse } from './htmlFetcher.js';
import { playwrightFetch } from './playwrightFetcher.js';
import { browserlessFetch, isBrowserlessConfigured } from './browserlessFetcher.js';
import type { ScraperResult } from '../types/scraper.js';

// ... existing helper functions (isForceAIEnabled, hasCompleteData) ...

/**
 * Main scraper function that orchestrates the extraction pipeline
 *
 * Implements a tiered fallback strategy:
 * - Tier 1: HTML fetch + Cheerio (fast path)
 * - Tier 2: Playwright headless browser + AI fallback
 * - Tier 3: BrowserQL + AI (cloud browser fallback)
 */
export async function scrapeProduct(url: string): Promise<ScraperResult> {
  // Debug mode: Skip to Playwright + AI
  if (isForceAIEnabled()) {
    console.log(`[Scraper] FORCE_AI_EXTRACTION enabled - skipping HTML fetcher`);
    const result = await playwrightFetch(url);

    // If Playwright fails and BrowserQL is configured, try Tier 3
    if (!result.success && isBrowserlessConfigured()) {
      console.log(`[Scraper] Playwright failed, trying BrowserQL fallback...`);
      return await browserlessFetch(url);
    }

    return result;
  }

  // Tier 1: Try HTML fetcher first
  console.log(`[Scraper] Tier 1: Trying HTML fetcher for: ${url}`);
  const htmlResult = await fetchAndParse(url);

  if (htmlResult.success && hasCompleteData(htmlResult)) {
    console.log(`[Scraper] Tier 1 succeeded with complete data`);
    return htmlResult;
  }

  // Tier 2: Playwright + AI
  if (htmlResult.success) {
    console.log(`[Scraper] Tier 1 incomplete, trying Tier 2 (Playwright)...`);
  } else {
    console.log(`[Scraper] Tier 1 failed (${htmlResult.error}), trying Tier 2...`);
  }

  const playwrightResult = await playwrightFetch(url);

  if (playwrightResult.success && hasCompleteData(playwrightResult)) {
    console.log(`[Scraper] Tier 2 succeeded via: ${playwrightResult.method}`);
    return playwrightResult;
  }

  // Tier 3: BrowserQL fallback (if configured)
  if (isBrowserlessConfigured()) {
    console.log(`[Scraper] Tier 2 failed, trying Tier 3 (BrowserQL)...`);
    const browserlessResult = await browserlessFetch(url);

    if (browserlessResult.success) {
      console.log(`[Scraper] Tier 3 succeeded via BrowserQL + AI`);
      return browserlessResult;
    }

    // BrowserQL also failed - return its error (final failure)
    console.error(`[Scraper] All tiers failed for: ${url}`);
    console.error(`[Scraper] Final error: ${browserlessResult.error}`);
    return browserlessResult;
  }

  // No BrowserQL configured, return Playwright result
  console.error(`[Scraper] All extraction methods failed for: ${url}`);
  console.error(`[Scraper] Final error: ${playwrightResult.error}`);
  return playwrightResult;
}

// ... existing exports ...
```

---

## BrowserQL Request Format

**Full URL constructed as:**
```
${BROWSERLESS_ENDPOINT}?token=${BROWSERLESS_TOKEN}${BROWSERLESS_PROXY_STRING}${BROWSERLESS_OPTIONS_STRING}
```

**Example:**
```
https://production-sfo.browserless.io/stealth/bql?token=xxx&proxy=residential&proxyCountry=us&blockAds=true&blockConsentModals=true
```

**Request headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "query": "mutation GetPageData { viewport(...) goto(...) pageContent: html(...) { html } }",
  "operationName": "GetPageData"
}
```

**GraphQL Mutation:**
```graphql
mutation GetPageData {
  viewport(width: 1366, height: 768) {
    width
    height
    time
  }
  goto(
    url: "${productUrl}"    # Dynamic - the product URL we want to scrape
    waitUntil: load
    ,timeout: ${timeout}    # From BROWSERLESS_TIMEOUT env var
  ) {
    status
  }
  pageContent: html(
    clean: {
      removeNonTextNodes: false
      removeAttributes: true
      removeRegex: true
    }
  ) {
    html
  }
}
```

**Note:** The `url` in `goto()` is the dynamic product URL passed to `browserlessFetch(url)`, interpolated into the query string at runtime.

**Clean Options (hardcoded):**
| Option | Value | Reason |
|--------|-------|--------|
| `removeNonTextNodes` | `false` | Keep `<img>` tags for image URL extraction |
| `removeAttributes` | `true` | Reduce HTML size, AI doesn't need class/id/style |
| `removeRegex` | `true` | Clean up noise |

---

## Testing

### Manual Testing

1. Get API token from browserless.io
2. Add to `.env`:
   ```env
   BROWSERLESS_ENDPOINT=https://production-sfo.browserless.io/stealth/bql
   BROWSERLESS_TOKEN=your-token
   BROWSERLESS_PROXY_STRING=&proxy=residential&proxyCountry=us
   BROWSERLESS_OPTIONS_STRING=&blockAds=true&blockConsentModals=true
   BROWSERLESS_TIMEOUT=30000
   ```
3. Test with a URL that fails Playwright:
   ```bash
   FORCE_AI_EXTRACTION=true pnpm --filter @price-monitor/worker dev
   # Trigger a price check for Woolworths NZ
   ```

### Test URLs

- **Woolworths NZ:** `https://www.woolworths.co.nz/shop/productdetails?stockcode=320675&name=monster-ultra-energy-drink-peachy-keen`

### Expected Log Output

```
[Scraper] Tier 1: Trying HTML fetcher for: <url>
[Scraper] Tier 1 failed (blocked by bot detection), trying Tier 2...
[Playwright] Navigating to: <url>
[Playwright] Navigation timeout after 30000ms
[Scraper] Tier 2 failed, trying Tier 3 (BrowserQL)...
[BrowserQL] Fetching: <url>
[BrowserQL] Received 45678 chars
[BrowserQL] Passing HTML to AI extractor...
[AI Extractor] Using provider: anthropic, model: claude-3-haiku-20240307
[AI Extractor] Sending 15000 chars to anthropic...
[Scraper] Tier 3 succeeded via BrowserQL + AI
```

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/services/browserlessFetcher.ts` | Create | BrowserQL client |
| `apps/worker/src/services/scraper.ts` | Modify | Add Tier 3 fallback logic |
| `apps/worker/src/types/scraper.ts` | Modify | Add 'browserless' to method type |
| `.env.example` | Modify | Add BROWSERLESS_* env vars |

---

## Completion Criteria

- [ ] `browserlessFetcher.ts` created with BrowserQL client
- [ ] `scraper.ts` updated with Tier 3 fallback logic
- [ ] `ScraperResult.method` supports 'browserless'
- [ ] `.env.example` updated with all BROWSERLESS_* variables
- [ ] Tested with Woolworths NZ URL
- [ ] Tier 3 disabled when any required env var is missing
- [ ] No TypeScript errors

---

## Notes

- BrowserQL is a **paid service** - only triggers as last resort after Tier 1 and Tier 2 fail
- Uses `/stealth/bql` endpoint with residential proxy for better bot detection bypass
- **If BrowserQL fails, the entire extraction fails** - no further fallbacks
- Tier 3 is disabled if ANY of the 4 required env vars are missing (ENDPOINT, TOKEN, PROXY_STRING, OPTIONS_STRING)
- Token is passed via URL query parameter (required by browserless.io API)
- The `viewport` setting ensures consistent rendering across requests
- The product URL is interpolated into the GraphQL query string at runtime (not a GraphQL variable)
