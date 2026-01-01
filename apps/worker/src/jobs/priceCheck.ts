import type { Job } from "bullmq";
import { scrapeProduct, type ScraperResult } from "../services/scraper.js";
import {
  savePriceRecord,
  updateProductTimestamp,
  logRun,
  getProductById,
  getOrCreateProductByUrl,
} from "../services/database.js";

/**
 * Job data interface for price check jobs
 */
interface PriceCheckJobData {
  url: string; // URL is now required (natural key)
  productId?: string; // Optional - for backward compatibility with cron jobs
  triggeredAt?: Date;
}

/**
 * Job result type
 */
type PriceCheckResult =
  | ScraperResult
  | { status: "skipped"; reason: string };

/**
 * Format error message for logging
 */
function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Resolve target URL from job data
 * Supports both URL-first (new) and productId (legacy) approaches
 */
async function resolveTargetUrl(
  url: string | undefined,
  productId: string | undefined,
  jobId: string
): Promise<string | null> {
  // Modern approach: URL is directly provided
  if (url) {
    return url;
  }

  // Legacy approach: Lookup URL by productId
  if (productId) {
    console.log(`[${jobId}] No URL provided, looking up by productId (legacy mode)`);
    const product = await getProductById(productId);
    if (product) {
      console.log(`[${jobId}] Found URL in database: ${product.url}`);
      return product.url;
    }
  }

  return null;
}

/**
 * Save scraped price data to database
 * Automatically creates product record if it doesn't exist
 */
async function savePriceData(
  url: string,
  title: string | null,
  price: number,
  currency: string,
  jobId: string
): Promise<void> {
  const productName = title || "Unknown Product";
  const product = await getOrCreateProductByUrl(url, productName);

  console.log(`[${jobId}] Using product ID: ${product.id}`);

  await savePriceRecord({
    productId: product.id,
    price,
    currency,
  });

  await updateProductTimestamp(product.id);
  await logRun({ productId: product.id, status: "SUCCESS" });
  console.log(`[${jobId}] Price saved to database`);
}

/**
 * Job processor for price check jobs
 * Scrapes product URL and saves price data to database
 * Products are automatically looked up by URL or created if they don't exist
 */
export default async function priceCheckJob(
  job: Job<PriceCheckJobData>
): Promise<PriceCheckResult> {
  const { url, productId } = job.data;
  const jobId = String(job.id);

  console.log(`[${jobId}] Processing price check for URL: ${url || "(lookup required)"}`);

  // Resolve target URL (supports both modern URL-first and legacy productId approaches)
  const targetUrl = await resolveTargetUrl(url, productId, jobId);
  if (!targetUrl) {
    console.log(`[${jobId}] No URL provided or found, skipping`);
    return { status: "skipped", reason: "no_url" };
  }

  // Run scraper
  console.log(`[${jobId}] Scraping URL: ${targetUrl}`);
  const result = await scrapeProduct(targetUrl);

  if (!result.success) {
    console.error(`[${jobId}] Scrape failed:`, result.error);
    return result;
  }

  if (!result.data) {
    console.log(`[${jobId}] No data extracted`);
    return result;
  }

  console.log(`[${jobId}] Scrape successful:`, result.data);

  // Save price data if available
  if (result.data.price !== null && result.data.currency !== null) {
    try {
      await savePriceData(
        targetUrl,
        result.data.title,
        result.data.price,
        result.data.currency,
        jobId
      );
    } catch (dbError) {
      console.error(`[${jobId}] Database error:`, dbError);
      console.log(`[${jobId}] Failed to save: ${formatErrorMessage(dbError)}`);
    }
  } else {
    console.log(`[${jobId}] No price data to save`);
  }

  return result;
}
