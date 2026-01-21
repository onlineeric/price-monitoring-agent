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
 * Check if scraper result has all required data fields
 */
function hasCompleteData(result: ScraperResult): boolean {
  if (!result.success || !result.data) {
    return false;
  }

  const { price, currency, imageUrl } = result.data;
  return price !== null && currency !== null && imageUrl !== null;
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

  // Check if HTML fetcher got complete data (not just success flag)
  if (htmlResult.success && hasCompleteData(htmlResult)) {
    console.log(`[Scraper] HTML fetcher succeeded with complete data`);
    return htmlResult;
  }

  // Tier 2: Fall back to Playwright (robust + smart path)
  if (htmlResult.success) {
    console.log(`[Scraper] HTML succeeded but data incomplete, trying Playwright for: ${url}`);
  } else {
    console.log(`[Scraper] HTML failed (${htmlResult.error}), trying Playwright for: ${url}`);
  }

  const playwrightResult = await playwrightFetch(url);

  if (playwrightResult.success) {
    console.log(`[Scraper] Extraction succeeded via: ${playwrightResult.method}`);
  } else {
    console.error(`[Scraper] All extraction methods failed for: ${url}`);
    console.error(`[Scraper] Final error: ${playwrightResult.error}`);
  }

  return playwrightResult;
}

// Re-export types for convenience
export type { ScraperResult, ScraperConfig } from "../types/scraper.js";

// Re-export browser cleanup for graceful shutdown
export { closeBrowser } from "./playwrightFetcher.js";
