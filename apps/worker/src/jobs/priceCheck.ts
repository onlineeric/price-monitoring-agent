import type { Job } from "bullmq";
import { scrapeProduct, type ScraperResult } from "../services/scraper.js";
import {
  savePriceRecord,
  updateProductTimestamp,
  logRun,
  getProductById,
} from "../services/database.js";

/**
 * Job data interface for price check jobs
 */
interface PriceCheckJobData {
  productId: string;
  url?: string; // Optional - if not provided, fetched from database
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
 * Scrapes the product URL and saves price data to the database.
 */
export default async function priceCheckJob(
  job: Job<PriceCheckJobData>
): Promise<PriceCheckResult> {
  const { productId, url } = job.data;
  console.log(`[${job.id}] Processing price check for product: ${productId}`);

  // If no URL provided, try to get it from the database
  let targetUrl = url;
  if (!targetUrl) {
    const product = await getProductById(productId);
    if (product) {
      targetUrl = product.url;
      console.log(`[${job.id}] Found URL in database: ${targetUrl}`);
    }
  }

  // Still no URL? Skip and log failure.
  if (!targetUrl) {
    console.log(`[${job.id}] No URL provided or found, skipping`);
    try {
      await logRun({
        productId,
        status: "FAILED",
        errorMessage: "No URL available",
      });
    } catch {
      // Product might not exist in DB, ignore logging error
      console.log(`[${job.id}] Could not log run (product may not exist)`);
    }
    return { status: "skipped", reason: "no_url" };
  }

  // Run scraper
  console.log(`[${job.id}] Scraping URL: ${targetUrl}`);
  const result = await scrapeProduct(targetUrl);

  if (result.success && result.data) {
    console.log(`[${job.id}] Scrape successful:`, result.data);

    // Save to database if we have price data
    if (result.data.price !== null && result.data.currency !== null) {
      try {
        await savePriceRecord({
          productId,
          price: result.data.price,
          currency: result.data.currency,
        });
        await updateProductTimestamp(productId);
        await logRun({ productId, status: "SUCCESS" });
        console.log(`[${job.id}] Price saved to database`);
      } catch (dbError) {
        console.error(`[${job.id}] Database error:`, dbError);
        try {
          await logRun({
            productId,
            status: "FAILED",
            errorMessage:
              dbError instanceof Error ? dbError.message : "Database error",
          });
        } catch {
          // Ignore logging error
        }
      }
    } else {
      console.log(`[${job.id}] No price data to save`);
      try {
        await logRun({
          productId,
          status: "FAILED",
          errorMessage: "No price extracted",
        });
      } catch {
        // Ignore logging error
      }
    }
  } else {
    console.error(`[${job.id}] Scrape failed:`, result.error);
    try {
      await logRun({
        productId,
        status: "FAILED",
        errorMessage: result.error,
      });
    } catch {
      // Ignore logging error
    }
  }

  return result;
}
