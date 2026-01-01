import { fetchAndParse } from "./htmlFetcher.js";
import { playwrightFetch } from "./playwrightFetcher.js";
import type { ScraperResult } from "../types/scraper.js";

/**
 * Check if debug mode is enabled for forcing AI extraction
 */
function isForceAIEnabled(): boolean {
  return process.env.FORCE_AI_EXTRACTION === "true";
}

/**
 * Main scraper function that orchestrates the extraction pipeline
 *
 * Implements a tiered fallback strategy:
 * - Tier 1: HTML fetch + Cheerio (fast path)
 * - Tier 2: Playwright headless browser (robust path)
 *   - Tries selector-based extraction first
 *   - Falls back to AI extraction with rendered HTML if selectors fail
 *
 * Debug mode: Set FORCE_AI_EXTRACTION=true to skip Tier 1 and force AI extraction
 */
export async function scrapeProduct(url: string): Promise<ScraperResult> {
  // Debug mode: Skip HTML fetcher and go directly to Playwright + AI
  if (isForceAIEnabled()) {
    console.log(`[Scraper] 🧪 FORCE_AI_EXTRACTION enabled - skipping HTML fetcher`);
    console.log(`[Scraper] Going directly to Playwright + AI for: ${url}`);

    const result = await playwrightFetch(url);
    console.log(
      `[Scraper] Extraction ${result.success ? "succeeded" : "failed"} via: ${result.method}`
    );
    return result;
  }

  // Normal flow: Tier 1 -> Tier 2

  // Tier 1: Try HTML fetcher first (fast path)
  console.log(`[Scraper] Trying HTML fetcher for: ${url}`);
  const htmlResult = await fetchAndParse(url);

  if (htmlResult.success) {
    console.log(`[Scraper] HTML fetcher succeeded`);
    return htmlResult;
  }

  // Tier 2: Fall back to Playwright (robust + smart path)
  console.log(`[Scraper] HTML failed (${htmlResult.error}), trying Playwright for: ${url}`);
  const playwrightResult = await playwrightFetch(url);

  if (playwrightResult.success) {
    console.log(`[Scraper] Extraction succeeded via: ${playwrightResult.method}`);
  } else {
    console.log(`[Scraper] All extraction methods failed for: ${url}`);
  }

  return playwrightResult;
}

// Re-export types for convenience
export type { ScraperResult, ScraperConfig } from "../types/scraper.js";

// Re-export browser cleanup for graceful shutdown
export { closeBrowser } from "./playwrightFetcher.js";
