import { fetchAndParse } from "./htmlFetcher.js";
import { playwrightFetch } from "./playwrightFetcher.js";
import type { ScraperResult } from "../types/scraper.js";

/**
 * Main scraper function that orchestrates the extraction pipeline.
 *
 * Implements a tiered fallback strategy:
 * - Tier 1: HTML fetch + Cheerio (fast path)
 * - Tier 2: Playwright headless browser (robust path)
 * - Tier 3: AI extraction (smart path) [Task 4.1]
 */
export async function scrapeProduct(url: string): Promise<ScraperResult> {
  // Tier 1: Try HTML fetcher first (fast path)
  console.log(`[Scraper] Trying HTML fetcher for: ${url}`);
  const htmlResult = await fetchAndParse(url);

  if (htmlResult.success) {
    console.log(`[Scraper] HTML fetcher succeeded`);
    return htmlResult;
  }

  // Tier 2: Fall back to Playwright (robust path)
  console.log(
    `[Scraper] HTML failed (${htmlResult.error}), trying Playwright for: ${url}`
  );
  const playwrightResult = await playwrightFetch(url);

  if (playwrightResult.success) {
    console.log(`[Scraper] Playwright succeeded`);
    return playwrightResult;
  }

  // TODO: Add AI fallback (Task 4.1)
  // console.log(`[Scraper] Playwright failed, trying AI extraction for: ${url}`);
  // const aiResult = await aiExtract(url, html);
  // if (aiResult.success) return aiResult;

  // Return last error if all tiers fail
  console.log(`[Scraper] All methods failed for: ${url}`);
  return playwrightResult;
}

// Re-export types for convenience
export type { ScraperResult, ScraperConfig } from "../types/scraper.js";

// Re-export browser cleanup for graceful shutdown
export { closeBrowser } from "./playwrightFetcher.js";
