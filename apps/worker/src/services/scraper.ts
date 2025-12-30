import { fetchAndParse } from "./htmlFetcher.js";
import type { ScraperResult } from "../types/scraper.js";

/**
 * Main scraper function that orchestrates the extraction pipeline.
 *
 * Currently implements Tier 1 (HTML fetch + Cheerio) only.
 * Future tasks will add:
 * - Tier 2: Playwright fallback (Task 3.2)
 * - Tier 3: AI extraction fallback (Task 4.1)
 */
export async function scrapeProduct(url: string): Promise<ScraperResult> {
  // Tier 1: Try HTML fetcher first (fast path)
  const htmlResult = await fetchAndParse(url);

  if (htmlResult.success) {
    return htmlResult;
  }

  // TODO: Add Playwright fallback (Task 3.2)
  // if (!htmlResult.success) {
  //   const playwrightResult = await playwrightFetch(url);
  //   if (playwrightResult.success) return playwrightResult;
  // }

  // TODO: Add AI fallback (Task 4.1)
  // if (!playwrightResult.success) {
  //   const aiResult = await aiExtract(url, html);
  //   if (aiResult.success) return aiResult;
  // }

  // Return the HTML result (with error) if all tiers fail
  return htmlResult;
}

// Re-export types for convenience
export type { ScraperResult, ScraperConfig } from "../types/scraper.js";
