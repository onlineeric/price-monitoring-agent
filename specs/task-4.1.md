# Technical Spec: Phase 4.1 - Vercel AI SDK Integration

**Phase:** 4.1
**Goal:** Integrate AI extraction using Vercel AI SDK with multi-provider support (OpenAI, Google, Anthropic).
**Context:** When HTML and Playwright extractors fail, we use AI to intelligently parse product data. Vercel AI SDK provides a unified, provider-agnostic interface that allows switching between LLM providers via environment configuration.

---

## Prerequisites

* **Task 3.3:** Database integration complete (can save extracted prices).
* **Task 3.2:** Playwright fallback working.
* **API Keys:** At least one provider API key:
  - OpenAI: [platform.openai.com](https://platform.openai.com)
  - Google: [aistudio.google.com](https://aistudio.google.com)
  - Anthropic: [console.anthropic.com](https://console.anthropic.com)

---

## Architecture Context

### Why Vercel AI SDK?

| Consideration | Decision |
|---------------|----------|
| Provider lock-in | ❌ Avoided - can switch providers via env var |
| Code complexity | ✅ Minimal - unified API across providers |
| Structured output | ✅ Built-in JSON schema with Zod |
| Industry adoption | ✅ 20M+ monthly downloads, Fortune 500 usage |
| Stack alignment | ✅ Same team as Next.js |

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
│  └─ Vercel AI SDK (provider-agnostic)                       │
│  └─ Providers: OpenAI | Google | Anthropic                  │
│  └─ Speed: ~1-3s | Cost: ~$0.001-0.01 per request           │
└─────────────────────────────────────────────────────────────┘
```

### Provider Selection Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   Environment Variable                       │
│                   AI_PROVIDER=openai                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────▼────────────────┐
         │     Vercel AI SDK (unified)     │
         │     - generateObject()          │
         │     - Zod schema validation     │
         └────────────────┬────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  @ai-sdk/openai    @ai-sdk/google    @ai-sdk/anthropic
        │                 │                 │
        ▼                 ▼                 ▼
   gpt-4o-mini      gemini-1.5-flash   claude-3-haiku
```

---

## Step 1: Get API Keys (Manual Step)

**User Action:**

Get at least one API key. For testing, OpenAI's `gpt-4o-mini` is recommended (cheapest).

Add to root `.env` file:

```env
# AI Provider Selection (openai | google | anthropic)
AI_PROVIDER="openai"

# Provider API Keys (add the ones you want to use)
OPENAI_API_KEY="sk-..."
GOOGLE_GENERATIVE_AI_API_KEY="..."
ANTHROPIC_API_KEY="sk-ant-..."
```

**Note:** You only need the API key for the provider you're using.

---

## Step 2: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/worker

# Vercel AI SDK core
pnpm add ai zod

# Provider packages (install all for flexibility)
pnpm add @ai-sdk/openai @ai-sdk/google @ai-sdk/anthropic
```

---

## Step 3: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to add AI-powered extraction with Vercel AI SDK.

### File 3.1: `apps/worker/src/services/aiExtractor.ts`

**Goal:** Implement provider-agnostic AI extraction using Vercel AI SDK.

**Requirements:**

* **Imports:**
  ```typescript
  import { generateObject } from 'ai';
  import { openai } from '@ai-sdk/openai';
  import { google } from '@ai-sdk/google';
  import { anthropic } from '@ai-sdk/anthropic';
  import { z } from 'zod';
  import type { ScraperResult } from '../types/scraper.js';
  ```

* **Product Schema (Zod):**
  ```typescript
  const ProductDataSchema = z.object({
    title: z.string().nullable().describe('The product name/title'),
    price: z.number().nullable().describe('The current price as a decimal number (e.g., 19.99)'),
    currency: z.string().nullable().describe('The currency code (USD, EUR, GBP, NZD, AUD, etc.)'),
  });
  ```

* **Provider Selection:**
  ```typescript
  type AIProvider = 'openai' | 'google' | 'anthropic';

  function getModel(provider: AIProvider) {
    switch (provider) {
      case 'google':
        return google('gemini-1.5-flash');
      case 'anthropic':
        return anthropic('claude-3-haiku-20240307');
      case 'openai':
      default:
        return openai('gpt-4o-mini');
    }
  }

  function getProvider(): AIProvider {
    const provider = process.env.AI_PROVIDER?.toLowerCase();
    if (provider === 'google' || provider === 'anthropic') {
      return provider;
    }
    return 'openai'; // default
  }
  ```

* **HTML Truncation Helper:**
  ```typescript
  function truncateHtml(html: string, maxLength: number = 15000): string {
    // Try to find main content areas first
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    let content = mainMatch?.[1] || articleMatch?.[1] || bodyMatch?.[1] || html;

    // Remove scripts, styles, and comments to reduce noise
    content = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '... [truncated]';
    }

    return content;
  }
  ```

* **Main Function:**
  ```typescript
  export async function aiExtract(url: string): Promise<ScraperResult>
  ```

* **Implementation Logic:**
  1. Fetch HTML from URL (reuse fetch logic or use simple fetch).
  2. Truncate HTML to fit token limits.
  3. Call `generateObject()` with Zod schema.
  4. Convert price to cents (multiply by 100).
  5. Return `ScraperResult` with `method: 'ai'`.

* **Full Implementation:**
  ```typescript
  export async function aiExtract(url: string): Promise<ScraperResult> {
    const provider = getProvider();
    console.log(`[AI Extractor] Using provider: ${provider}`);

    try {
      // Fetch HTML
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch URL: ${response.status}`,
          method: 'ai',
        };
      }

      const html = await response.text();
      const truncatedHtml = truncateHtml(html);

      console.log(`[AI Extractor] Sending ${truncatedHtml.length} chars to ${provider}...`);

      // Call AI with structured output
      const { object } = await generateObject({
        model: getModel(provider),
        schema: ProductDataSchema,
        prompt: `Extract product information from this HTML. Find the product title, current price (as a number without currency symbol), and currency code.

If there are multiple prices, extract the main/current selling price (not the original or crossed-out price).

HTML content:
${truncatedHtml}`,
      });

      console.log(`[AI Extractor] Response:`, object);

      // Validate we got useful data
      if (!object.title && object.price === null) {
        return {
          success: false,
          error: 'AI could not extract product data',
          method: 'ai',
        };
      }

      // Convert price to cents
      const priceInCents = object.price !== null ? Math.round(object.price * 100) : null;

      return {
        success: true,
        data: {
          title: object.title,
          price: priceInCents,
          currency: object.currency,
          imageUrl: null, // AI extraction doesn't get images for now
        },
        method: 'ai',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AI Extractor] Error:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        method: 'ai',
      };
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
    console.log(`[Scraper] HTML failed (${htmlResult.error}), trying Playwright for: ${url}`);
    const playwrightResult = await playwrightFetch(url);

    if (playwrightResult.success) {
      console.log(`[Scraper] Playwright succeeded`);
      return playwrightResult;
    }

    // Tier 3: Fall back to AI extraction (smart path)
    console.log(`[Scraper] Playwright failed (${playwrightResult.error}), trying AI extraction for: ${url}`);
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

### 4.2: Test with a Difficult URL

Use a URL that failed HTML and Playwright extraction:

**PowerShell:**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/debug/trigger" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"productId": "ai-test", "url": "https://www.rockshop.co.nz/line-6-helix-next-generation-amp-modelling-multi-fx-floor-version-99-060-0101"}'
```

### 4.3: Expected Worker Output

```text
[<job-id>] Processing price check for product: ai-test
[<job-id>] Scraping URL: https://www.rockshop.co.nz/...
[Scraper] Trying HTML fetcher for: https://...
[Scraper] HTML failed, trying Playwright for: https://...
[Scraper] Playwright failed, trying AI extraction for: https://...
[AI Extractor] Using provider: openai
[AI Extractor] Sending 15000 chars to openai...
[AI Extractor] Response: { title: 'Line 6 Helix...', price: 3499.00, currency: 'NZD' }
[Scraper] AI extraction succeeded
[<job-id>] Scrape successful: { title: '...', price: 349900, currency: 'NZD', method: 'ai' }
[<job-id>] Price saved to database
```

### 4.4: Test Provider Switching

Change the provider in `.env`:

```env
AI_PROVIDER="google"
```

Restart worker and test again. The logs should show:
```text
[AI Extractor] Using provider: google
```

---

## Step 5: Cost Comparison (Reference)

| Provider | Model | Input Cost | Output Cost | Typical Request |
|----------|-------|-----------|-------------|-----------------|
| OpenAI | gpt-4o-mini | $0.15/1M | $0.60/1M | ~$0.002 |
| Google | gemini-1.5-flash | $0.075/1M | $0.30/1M | ~$0.001 |
| Anthropic | claude-3-haiku | $0.25/1M | $1.25/1M | ~$0.003 |

**Recommendation:** Start with `gpt-4o-mini` or `gemini-1.5-flash` for best cost/performance.

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
│   ├── aiExtractor.ts      # NEW: Vercel AI SDK extraction
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

## Troubleshooting

### Issue: "Invalid API Key" or "Unauthorized"

**Cause:** API key not set or incorrect for selected provider.

**Solution:** Verify `.env` has correct key for the provider specified in `AI_PROVIDER`.

### Issue: "Model not found"

**Cause:** Using wrong model name for provider.

**Solution:** Check model names in provider's documentation.

### Issue: Schema validation error

**Cause:** AI returned data that doesn't match Zod schema.

**Solution:** The `generateObject()` function handles this automatically with retries. If persistent, check the prompt.

### Issue: "Rate limit exceeded"

**Cause:** Too many requests to provider API.

**Solution:** Add delay between requests or upgrade API plan.

---

## Environment Variables Summary

```env
# Required: Provider selection
AI_PROVIDER="openai"  # Options: openai | google | anthropic

# Required: API key for selected provider
OPENAI_API_KEY="sk-..."           # If AI_PROVIDER=openai
GOOGLE_GENERATIVE_AI_API_KEY="..."  # If AI_PROVIDER=google
ANTHROPIC_API_KEY="sk-ant-..."    # If AI_PROVIDER=anthropic
```

---

## Completion Criteria

Task 4.1 is complete when:

- [ ] Vercel AI SDK and provider packages installed
- [ ] At least one provider API key configured in `.env`
- [ ] `aiExtractor.ts` created with provider-agnostic logic
- [ ] `scraper.ts` updated with 3-tier fallback (HTML → Playwright → AI)
- [ ] AI extraction triggered when HTML and Playwright fail
- [ ] Successful extraction from a previously failing URL
- [ ] Provider can be switched via `AI_PROVIDER` env var
- [ ] Price saved to database with `method: 'ai'`
