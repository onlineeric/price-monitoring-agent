import type { Job } from "bullmq";
import { scrapeProduct, type ScraperResult } from "../services/scraper.js";

/**
 * Job data interface for price check jobs
 */
interface PriceCheckJobData {
  productId: string;
  url?: string; // Optional for backward compatibility (test mode)
  triggeredAt?: Date;
}

/**
 * Job result type
 */
type PriceCheckResult =
  | ScraperResult
  | { status: "skipped"; reason: string };

/**
 * Job processor for price check jobs.
 * Scrapes the product URL and extracts price data.
 */
export default async function priceCheckJob(
  job: Job<PriceCheckJobData>
): Promise<PriceCheckResult> {
  console.log(
    `[${job.id}] Processing price check for product: ${job.data.productId}`
  );

  // If no URL provided, skip scraping (test mode)
  if (!job.data.url) {
    console.log(`[${job.id}] No URL provided, skipping scrape (test mode)`);
    return { status: "skipped", reason: "no_url" };
  }

  // Run scraper
  console.log(`[${job.id}] Scraping URL: ${job.data.url}`);
  const result = await scrapeProduct(job.data.url);

  if (result.success) {
    console.log(`[${job.id}] Scrape successful:`, result.data);
    // TODO: Save to database (Task 3.3)
  } else {
    console.error(`[${job.id}] Scrape failed:`, result.error);
  }

  return result;
}
