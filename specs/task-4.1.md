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
│  Tier 2: PlaywrightFetcher (Robust + Smart Path) ← THIS TASK│
│  ├─ Step 1: Load page with Chromium (stealth mode) 🥷       │
│  │   └─ playwright-extra + stealth plugin                   │
│  │   └─ Bypasses ~70-80% of bot detection                   │
│  ├─ Step 2: Try selector-based extraction                   │
│  └─ Step 3: If selectors fail → AI with rendered HTML       │
│      └─ Vercel AI SDK (provider-agnostic)                   │
│      └─ Providers: OpenAI | Google | Anthropic              │
│      └─ Speed: ~3-6s total | Cost: ~$0.001-0.01 per AI call │
└─────────────────────────────────────────────────────────────┘
```

**Key Improvements:**
1. **Stealth Mode**: playwright-extra removes automation detection signals, allowing access to protected sites (Cloudflare, anti-bot systems).
2. **Unified HTML**: AI extraction receives fully-rendered HTML from Playwright (with JavaScript executed), not raw HTML from a fresh fetch. This eliminates redundant fetching and ensures AI gets the best possible HTML.

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

Get at least one API key and choose a model from the provider's documentation.

Add to root `.env` file:

```env
# AI Provider Selection (openai | google | anthropic)
AI_PROVIDER="openai"

# Provider API Keys
OPENAI_API_KEY="sk-..."
GOOGLE_GENERATIVE_AI_API_KEY="..."
ANTHROPIC_API_KEY="sk-ant-..."

# AI data models
# OpenAI: "gpt-4o-mini", "gpt-5-mini", "gpt-5.1", "gpt-5.2"
# Anthropic: "claude-3-5-haiku-20241022", "claude-3-haiku-20240307", "claude-haiku-4-5"
# Google Gemini: "gemini-1.5-flash", "gemini-2.5-flash", "gemini-3-flash-preview"
OPENAI_MODEL="gpt-5-mini"
ANTHROPIC_MODEL="claude-haiku-4-5"
GOOGLE_MODEL="gemini-2.5-flash"
```

**Note:** You must set both the API key AND model name for the provider you're using. Check the provider's documentation for available model names.

---

## Step 2: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/worker

# Vercel AI SDK core
pnpm add ai zod

# Provider packages (install all for flexibility)
pnpm add @ai-sdk/openai @ai-sdk/google @ai-sdk/anthropic

# Playwright stealth mode (bypass bot detection)
pnpm add playwright-extra puppeteer-extra-plugin-stealth
```

---

## Step 3: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to add AI-powered extraction with Vercel AI SDK.

### File 3.1: `apps/worker/src/services/aiExtractor.ts`

**Goal:** Implement provider-agnostic AI extraction using Vercel AI SDK. AI receives fully-rendered HTML from Playwright instead of fetching independently.

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

* **Provider and Model Selection:**
  ```typescript
  type AIProvider = 'openai' | 'google' | 'anthropic';

  function getModelName(provider: AIProvider): string {
    let modelName: string | undefined;
    let envVarName: string;

    switch (provider) {
      case 'google':
        modelName = process.env.GOOGLE_MODEL;
        envVarName = 'GOOGLE_MODEL';
        break;
      case 'anthropic':
        modelName = process.env.ANTHROPIC_MODEL;
        envVarName = 'ANTHROPIC_MODEL';
        break;
      case 'openai':
      default:
        modelName = process.env.OPENAI_MODEL;
        envVarName = 'OPENAI_MODEL';
        break;
    }

    if (!modelName) {
      throw new Error(
        `${envVarName} environment variable is required for AI extraction`
      );
    }

    return modelName;
  }

  function getModel(provider: AIProvider) {
    const modelName = getModelName(provider);

    switch (provider) {
      case 'google':
        return google(modelName);
      case 'anthropic':
        return anthropic(modelName);
      case 'openai':
      default:
        return openai(modelName);
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
  export async function aiExtract(url: string, html: string): Promise<ScraperResult>
  ```

* **Implementation Logic:**
  1. Accept fully-rendered HTML as parameter (from Playwright).
  2. Prepare/truncate HTML to fit token limits.
  3. Call `generateObject()` with Zod schema.
  4. Convert price to cents (multiply by 100).
  5. Return `ScraperResult` with `method: 'ai'`.

* **Full Implementation:**
  ```typescript
  export async function aiExtract(url: string, html: string): Promise<ScraperResult> {
    const provider = getProvider();
    const modelName = getModelName(provider);
    console.log(`[AI Extractor] Using provider: ${provider}, model: ${modelName}`);

    try {
      // Prepare HTML for AI (truncate to fit token limits)
      const preparedHtml = prepareHtmlForAI(html);

      console.log(`[AI Extractor] Sending ${preparedHtml.length} chars to ${provider}...`);

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

### File 3.2: Update `apps/worker/src/services/playwrightFetcher.ts`

**Goal:** Integrate AI extraction into Playwright tier when selectors fail. Add stealth mode to bypass bot detection.

**Requirements:**

* **Updated Imports (Add Stealth):**
  ```typescript
  import { chromium } from 'playwright-extra';
  import StealthPlugin from 'puppeteer-extra-plugin-stealth';
  import type { Browser, Page } from 'playwright';
  import { aiExtract } from './aiExtractor.js';

  // Apply stealth plugin to avoid bot detection
  chromium.use(StealthPlugin());
  ```

* **Updated Logic (after page.goto succeeds):**
  ```typescript
  // Get fully-rendered HTML (with JavaScript executed)
  const renderedHtml = await page.content();
  console.log(`[Playwright] Page loaded, HTML size: ${renderedHtml.length} chars`);

  // Try selector-based extraction...
  const rawData = await page.evaluate(...);

  // Parse extracted data...

  // Check if selectors succeeded
  if (!rawData.title && !price) {
    // Selectors failed, but we have rendered HTML - try AI extraction
    console.log(`[Playwright] Selectors failed to extract data, trying AI with rendered HTML...`);

    await page.close();
    page = null;

    // Call AI with the fully-rendered HTML
    const aiResult = await aiExtract(url, renderedHtml);
    return aiResult;
  }

  // Selector extraction succeeded
  return { success: true, data: {...}, method: 'playwright' };
  ```

### File 3.3: Update `apps/worker/src/services/scraper.ts`

**Goal:** Remove separate AI tier (now integrated into Playwright).

**Requirements:**

* **Remove AI import** (no longer needed at scraper level)

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

    // Tier 2: Fall back to Playwright (robust + smart path)
    // Playwright will try selectors first, then AI if selectors fail
    console.log(`[Scraper] HTML failed (${htmlResult.error}), trying Playwright for: ${url}`);
    const playwrightResult = await playwrightFetch(url);

    if (playwrightResult.success) {
      console.log(`[Scraper] Extraction succeeded via: ${playwrightResult.method}`);
      return playwrightResult;
    }

    // Both tiers failed
    console.log(`[Scraper] All extraction methods failed for: ${url}`);
    return playwrightResult;
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
  -Body '{"url": "https://www.woolworths.co.nz/shop/productdetails?stockcode=320675&name=monster-ultra-energy-drink-peachy-keen"}'
```

**Note:** The debug endpoint now only accepts `url` - products are automatically looked up or created by the worker using the URL as the natural key.

### 4.3: Expected Worker Output

**Scenario: HTML fails → Playwright loads → Selectors fail → AI succeeds**

```text
[<job-id>] Processing price check for URL: https://www.woolworths.co.nz/...
[<job-id>] Scraping URL: https://www.woolworths.co.nz/...
[Scraper] Trying HTML fetcher for: https://...
[Scraper] HTML failed (Could not extract product data), trying Playwright for: https://...
[Playwright] Launching browser...
[Playwright] Navigating to: https://...
[Playwright] Page loaded, HTML size: 245837 chars
[Playwright] Selectors failed to extract data, trying AI with rendered HTML...
[AI Extractor] Using provider: openai, model: <your-model-name>
[AI Extractor] Sending 15000 chars to openai...
[AI Extractor] Response: { title: 'Monster Ultra...', price: 6.90, currency: 'NZD' }
[Scraper] Extraction succeeded via: ai
[<job-id>] Scrape successful: { title: '...', price: 690, currency: 'NZD', method: 'ai' }
[<job-id>] Price saved to database
```

**Key Difference:** AI is called FROM Playwright (not as a separate tier), and receives the fully-rendered HTML that Playwright already loaded.

### 4.4: Test Provider Switching

Change the provider in `.env`:

```env
AI_PROVIDER="google"
GOOGLE_MODEL="<google-model-name>"
```

Restart worker and test again. The logs should show:
```text
[AI Extractor] Using provider: google, model: <google-model-name>
```

### 4.5: Test Different Models (Optional)

To use a different model, change the model env var in `.env`:

```env
AI_PROVIDER="openai"
OPENAI_MODEL="<different-model-name>"  # Check provider docs for available models
```

Restart worker and the logs should show:
```text
[AI Extractor] Using provider: openai, model: <different-model-name>
```

---

## Step 5: Model Selection Guidelines

When choosing a model, consider:

- **Cost**: Check the provider's pricing page for per-token costs
- **Speed**: Smaller/cheaper models are usually faster
- **Accuracy**: More expensive models generally perform better on complex pages
- **Rate Limits**: Check your API tier's rate limits

**Recommendation:** Start with the cheapest model from your chosen provider and upgrade only if extraction quality is insufficient.

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

### Issue: "OPENAI_MODEL environment variable is required"

**Cause:** Model name not set for the selected provider.

**Solution:** Add the model env var to `.env` (check provider docs for available models):
```env
OPENAI_MODEL="<model-name>"
```

### Issue: "Invalid API Key" or "Unauthorized"

**Cause:** API key not set or incorrect for selected provider.

**Solution:** Verify `.env` has correct key for the provider specified in `AI_PROVIDER`.

### Issue: "Model not found" or API returns model error

**Cause:** The model name in your env var is not valid for the provider.

**Solution:** Check the provider's documentation for current model names and update your `.env` file. The code passes model names directly to the API without validation.

### Issue: Schema validation error

**Cause:** AI returned data that doesn't match Zod schema.

**Solution:** The `generateObject()` function handles this automatically with retries. If persistent, check the prompt.

### Issue: "Rate limit exceeded"

**Cause:** Too many requests to provider API.

**Solution:** Add delay between requests or upgrade API plan.

### Issue: "ERR_HTTP2_PROTOCOL_ERROR" or "net::ERR_ABORTED" from Playwright

**Cause:** Website is detecting and blocking automated browsers (anti-bot protection like Cloudflare, DataDome).

**Solution:** The stealth plugin bypasses ~70-80% of bot detection. If it still fails:
1. Check if the site works in a regular browser
2. The site may require residential proxies (advanced protection)
3. Try a different product URL from a less protected site

---

## Environment Variables Summary

```env
# Required: Provider selection
AI_PROVIDER="openai"  # Options: openai | google | anthropic

# Required: API key for selected provider
OPENAI_API_KEY="sk-..."           # Required if AI_PROVIDER=openai
GOOGLE_GENERATIVE_AI_API_KEY="..."  # Required if AI_PROVIDER=google
ANTHROPIC_API_KEY="sk-ant-..."    # Required if AI_PROVIDER=anthropic

# Required: Model name for selected provider
OPENAI_MODEL="<model-name>"       # Required if AI_PROVIDER=openai
GOOGLE_MODEL="<model-name>"       # Required if AI_PROVIDER=google
ANTHROPIC_MODEL="<model-name>"    # Required if AI_PROVIDER=anthropic
```

**Note:** Model names must match those supported by the provider. The code does not validate model names - invalid models will cause API errors that are handled by normal error handling.

---

## Completion Criteria

Task 4.1 is complete when:

- [ ] Vercel AI SDK and provider packages installed
- [ ] Stealth plugin (`playwright-extra` + `puppeteer-extra-plugin-stealth`) installed
- [ ] At least one provider API key configured in `.env`
- [ ] `aiExtractor.ts` created with provider-agnostic logic (accepts HTML parameter)
- [ ] `playwrightFetcher.ts` updated with stealth mode and AI integration
- [ ] `scraper.ts` updated to 2-tier architecture (HTML → Playwright with AI fallback)
- [ ] AI extraction triggered when Playwright selectors fail
- [ ] Stealth mode bypasses bot detection on protected sites
- [ ] Successful extraction from a previously failing URL
- [ ] Provider can be switched via `AI_PROVIDER` env var
- [ ] Price saved to database with `method: 'ai'`
