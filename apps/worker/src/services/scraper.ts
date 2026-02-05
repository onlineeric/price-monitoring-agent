import { fetchAndParse } from "./htmlFetcher.js";
import { playwrightFetch } from "./playwrightFetcher.js";
import {
  browserlessFetch,
  isBrowserlessConfigured,
} from "./browserlessFetcher.js";
import type { ScraperResult } from "../types/scraper.js";

/**
 * Check if debug mode is enabled for forcing AI extraction
 */
function isForceAIEnabled(): boolean {
  return process.env.FORCE_AI_EXTRACTION === "true";
}

/**
 * Check if debug mode is enabled for forcing BrowserQL (Tier 3)
 */
function isForceBrowserlessEnabled(): boolean {
  return process.env.FORCE_USE_BROWSERLESS === "true";
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
 * - Tier 3: BrowserQL + AI (cloud browser fallback)
 *   - Only triggers when Tier 2 completely fails
 *   - Requires browserless.io configuration
 *
 * Debug mode: Set FORCE_AI_EXTRACTION=true to skip Tier 1 and force AI extraction
 */
export async function scrapeProduct(url: string): Promise<ScraperResult> {
  // Debug mode: Skip directly to BrowserQL (Tier 3)
  if (isForceBrowserlessEnabled()) {
    if (!isBrowserlessConfigured()) {
      console.error(
        `[Scraper] FORCE_USE_BROWSERLESS enabled but BrowserQL not configured`
      );
      return {
        success: false,
        error: "BrowserQL not configured: missing required env vars",
        method: "browserless",
      };
    }
    console.log(
      `[Scraper] FORCE_USE_BROWSERLESS enabled - skipping to Tier 3`
    );
    return await browserlessFetch(url);
  }

  // Debug mode: Skip HTML fetcher and go directly to Playwright + AI
  if (isForceAIEnabled()) {
    console.log(
      `[Scraper] FORCE_AI_EXTRACTION enabled - skipping HTML fetcher`
    );
    const result = await playwrightFetch(url);

    // If Playwright fails and BrowserQL is configured, try Tier 3
    if (!result.success && isBrowserlessConfigured()) {
      console.log(`[Scraper] Playwright failed, trying BrowserQL fallback...`);
      return await browserlessFetch(url);
    }

    return result;
  }

  // Normal flow: Tier 1 -> Tier 2 -> Tier 3

  // Tier 1: Try HTML fetcher first (fast path)
  console.log(`[Scraper] Tier 1: Trying HTML fetcher for: ${url}`);
  const htmlResult = await fetchAndParse(url);

  // Check if HTML fetcher got complete data (not just success flag)
  if (htmlResult.success && hasCompleteData(htmlResult)) {
    console.log(`[Scraper] Tier 1 succeeded with complete data`);
    return htmlResult;
  }

  // Tier 2: Fall back to Playwright (robust + smart path)
  if (htmlResult.success) {
    console.log(`[Scraper] Tier 1 incomplete, trying Tier 2 (Playwright)...`);
  } else {
    console.log(
      `[Scraper] Tier 1 failed (${htmlResult.error}), trying Tier 2...`
    );
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
  if (!playwrightResult.success) {
    console.error(`[Scraper] All extraction methods failed for: ${url}`);
    console.error(`[Scraper] Final error: ${playwrightResult.error}`);
  } else {
    console.log(`[Scraper] Extraction succeeded via: ${playwrightResult.method}`);
  }

  return playwrightResult;
}

// Re-export types for convenience
export type { ScraperResult, ScraperConfig } from "../types/scraper.js";

// Re-export browser cleanup for graceful shutdown
export { closeBrowser } from "./playwrightFetcher.js";
