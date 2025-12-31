# Technical Spec: Phase 4.1 - OpenAI Integration

**Phase:** 4.1
**Goal:** Integrate OpenAI as the third-tier "Smart Path" for extracting product data when HTML and Playwright methods fail.
**Context:** Some websites have complex structures, anti-bot measures, or unusual layouts that defeat our CSS selector-based extraction. By sending HTML snippets to OpenAI, we can leverage AI to intelligently parse and extract price data.

---

## Prerequisites

* **Task 3.3:** Database integration complete (can save extracted prices).
* **Task 3.2:** Playwright fallback working.
* **OpenAI Account:** API key available from [platform.openai.com](https://platform.openai.com).

---

## Architecture Context

### Extraction Pipeline (Complete)

```
┌─────────────────────────────────────────────────────────────┐
│                    Extraction Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: HtmlFetcher (Fast Path) ✅                         │
│  └─ HTTP fetch + Cheerio                                    │
│  └─ Speed: ~100-500ms | Cost: Free                          │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: PlaywrightFetcher (Robust Path) ✅                 │
│  └─ Headless Chromium browser                               │
│  └─ Speed: ~2-5s | Cost: Free (compute only)                │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: AI Extraction (Smart Path) ← THIS TASK             │
│  └─ OpenAI GPT-4o-mini                                      │
│  └─ Speed: ~1-3s | Cost: ~$0.001-0.01 per request           │
└─────────────────────────────────────────────────────────────┘
```

### When AI Extraction is Used

AI extraction is triggered when:
1. HTML fetcher fails to find title/price
2. Playwright fetcher also fails to find title/price
3. The page loaded successfully but data couldn't be extracted with selectors

---

## Step 1: Get OpenAI API Key (Manual Step)

**User Action:**

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add to root `.env` file:

```env
# OpenAI API Key
OPENAI_API_KEY="sk-..."
```

**Note:** Keep this key secret. Never commit to git.

---

## Step 2: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/worker

# Install OpenAI SDK
pnpm add openai
```

---

## Step 3: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to add AI-powered extraction.

### File 3.1: `apps/worker/src/services/aiExtractor.ts`

**Goal:** Implement the AI extraction service using OpenAI.

**Requirements:**

* **Imports:**
  ```typescript
  import OpenAI from 'openai';
  import type { ScraperResult } from '../types/scraper.js';
  import { parsePrice } from '../utils/priceParser.js';
  ```

* **OpenAI Client:**
  ```typescript
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  ```

* **System Prompt:**
  ```typescript
  const SYSTEM_PROMPT = `You are a product data extraction assistant. Your task is to extract product information from HTML content.

  Extract the following fields:
  - title: The product name/title
  - price: The current price (as a number, e.g., 19.99)
  - currency: The currency code (USD, EUR, GBP, NZD, AUD, etc.)

  Rules:
  - If there are multiple prices, extract the main/current price (not the original/crossed-out price)
  - Return prices as decimal numbers without currency symbols
  - If you cannot find a field, return null for that field
  - Be concise and accurate

  Respond ONLY with valid JSON in this exact format:
  {"title": "Product Name", "price": 19.99, "currency": "USD"}`;
  ```

* **Main Function:**
  ```typescript
  export async function aiExtract(html: string, url: string): Promise<ScraperResult>
  ```

* **Logic:**
  1. Truncate HTML to ~15,000 characters (to fit token limits and reduce cost).
  2. Focus on relevant parts: try to extract `<main>`, `<article>`, or product-related divs.
  3. Call OpenAI API with `gpt-4o-mini` model (fast and cheap).
  4. Parse JSON response.
  5. Convert price to cents using `parsePrice()` or direct multiplication.
  6. Return `ScraperResult` with `method: 'ai'`.

* **HTML Truncation Helper:**
  ```typescript
  function truncateHtml(html: string, maxLength: number = 15000): string {
    // Try to find main content areas first
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const productMatch = html.match(/<div[^>]*(?:product|item)[^>]*>([\s\S]*?)<\/div>/i);

    let content = mainMatch?.[1] || articleMatch?.[1] || productMatch?.[1] || html;

    // Remove scripts, styles, and comments
    content = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }

    return content;
  }
  ```

* **Error Handling:**
  - Handle API errors (rate limits, invalid key, etc.)
  - Handle JSON parse errors from AI response
  - Return `{ success: false, error: message, method: 'ai' }` on failure

* **Response Parsing:**
  ```typescript
  interface AiResponse {
    title: string | null;
    price: number | null;
    currency: string | null;
  }

  // Parse AI response, handling potential JSON in markdown code blocks
  function parseAiResponse(content: string): AiResponse | null {
    try {
      // Remove markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  ```

### File 3.2: Update `apps/worker/src/services/scraper.ts`

**Goal:** Add AI extraction as the third tier fallback.

**Requirements:**

* **New Import:**
  ```typescript
  import { aiExtract } from './aiExtractor.js';
  ```

* **Updated Scraper Function:**
  - After Playwright fails, fetch HTML again (if needed) and call AI extractor.
  - Pass the HTML content to AI for analysis.

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

    // Tier 3: Fall back to AI extraction (smart path)
    console.log(`[Scraper] Playwright failed, trying AI extraction for: ${url}`);
    const aiResult = await aiExtract(url);

    if (aiResult.success) {
      console.log(`[Scraper] AI extraction succeeded`);
      return aiResult;
    }

    // All tiers failed
    console.log(`[Scraper] All methods failed for: ${url}`);
    return aiResult;
  }
  ```

### File 3.3: Update `apps/worker/src/types/scraper.ts`

**Goal:** Add 'ai' to the method type.

**Requirements:**

Already included in the type - verify it exists:
```typescript
method: 'html' | 'playwright' | 'ai';
```

---

## Step 4: Environment Variable Loading (AI Generation Step)

**Instruction for AI:**

Ensure the worker loads `OPENAI_API_KEY` from the root `.env` file.

### File 4.1: Update `apps/worker/src/config.ts` (if needed)

**Verify** that the config loads `.env` from the root and exports are available.

The OpenAI SDK automatically reads `OPENAI_API_KEY` from `process.env`, but ensure dotenv is loaded before the aiExtractor is imported.

---

## Step 5: Verification (Manual Step)

### 5.1: Test with a Known Difficult URL

Use a URL that the HTML/Playwright extractors struggle with:

**PowerShell:**

```powershell
# Use a URL from task-3.2 that failed both tiers
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "test-ai", "url": "https://www.rockshop.co.nz/line-6-helix-next-generation-amp-modelling-multi-fx-floor-version-99-060-0101"}'
```

### 5.2: Expected Worker Output

```text
[<job-id>] Processing price check for product: test-ai
[<job-id>] Scraping URL: https://www.rockshop.co.nz/...
[Scraper] Trying HTML fetcher for: https://...
[Scraper] HTML failed, trying Playwright for: https://...
[Scraper] Playwright failed, trying AI extraction for: https://...
[AI Extractor] Sending HTML to OpenAI...
[AI Extractor] Response: { title: 'Line 6 Helix...', price: 3499, currency: 'NZD' }
[Scraper] AI extraction succeeded
[<job-id>] Scrape successful: { title: '...', price: 349900, currency: 'NZD', method: 'ai' }
```

### 5.3: Verify Cost

Check your OpenAI dashboard for usage. A single extraction with `gpt-4o-mini` should cost less than $0.01.

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
│   ├── aiExtractor.ts      # NEW: AI-powered extraction
│   ├── database.ts
│   ├── htmlFetcher.ts
│   ├── playwrightFetcher.ts
│   └── scraper.ts          # UPDATED: 3-tier fallback
├── jobs/
│   └── priceCheck.ts
└── queue/
    └── worker.ts
```

---

## Cost Considerations

| Model | Input Cost | Output Cost | Typical Request |
|-------|-----------|-------------|-----------------|
| gpt-4o-mini | $0.15/1M tokens | $0.60/1M tokens | ~$0.001-0.005 |
| gpt-4o | $2.50/1M tokens | $10/1M tokens | ~$0.01-0.05 |

**Recommendation:** Use `gpt-4o-mini` for extraction. It's fast, cheap, and accurate enough for structured data extraction.

---

## Troubleshooting

### Issue: "Invalid API Key"

**Cause:** `OPENAI_API_KEY` not set or incorrect.

**Solution:** Verify `.env` has the correct key and worker loads it.

### Issue: "Rate limit exceeded"

**Cause:** Too many requests to OpenAI API.

**Solution:** Add retry logic with exponential backoff, or use a rate limiter.

### Issue: AI returns invalid JSON

**Cause:** Model sometimes wraps response in markdown code blocks.

**Solution:** The `parseAiResponse()` helper strips markdown formatting.

### Issue: Extracted price is wrong

**Cause:** AI misinterpreted the HTML or found wrong price.

**Solution:** Improve the system prompt or increase HTML context. Consider validating price is reasonable.

---

## Completion Criteria

Task 4.1 is complete when:

- [ ] `OPENAI_API_KEY` added to `.env`
- [ ] `openai` package installed in worker
- [ ] `aiExtractor.ts` created with AI extraction logic
- [ ] `scraper.ts` updated with 3-tier fallback
- [ ] AI extraction triggered when HTML and Playwright fail
- [ ] Successful extraction from a previously failing URL
- [ ] Price saved to database with `method: 'ai'` logged
