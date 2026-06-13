import type { Job } from "bullmq";
import {
  getOrCreateProductByUrl,
  getProductById,
  getProductByUrl,
  logRun,
  savePriceRecord,
  saveProductInfo,
  updateProductFailure,
  updateProductTimestamp,
} from "../services/database.js";
import { type ProductInfoResult, scrapeProductInfo } from "../services/scraper.js";

/**
 * Job data for the rich metadata + price refresh.
 * URL-first (preferred); productId is a legacy fallback.
 */
interface UpdateProductInfoJobData {
  url?: string;
  productId?: string;
  triggeredAt?: Date;
}

/** Job result — the extraction result, or a skip when no URL could be resolved. */
type UpdateProductInfoResult = ProductInfoResult | { status: "skipped"; reason: string };

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Resolve target URL from job data (URL-first, productId legacy fallback).
 * Mirrors the resolution pattern in priceCheck.ts.
 */
async function resolveTargetUrl(
  url: string | undefined,
  productId: string | undefined,
  jobId: string,
): Promise<string | null> {
  if (url) {
    return url;
  }
  if (productId) {
    console.log(`[${jobId}] No URL provided, looking up by productId (legacy mode)`);
    const product = await getProductById(productId);
    if (product) {
      return product.url;
    }
  }
  return null;
}

/**
 * Record a total failure against the product, leaving its metadata untouched.
 * Attributes to the productId from the job when present, otherwise looks the
 * product up by URL (the on-add / per-product flows create the row first).
 */
async function recordFailure(
  url: string,
  productId: string | undefined,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  let id = productId ?? null;
  if (!id) {
    const existing = await getProductByUrl(url);
    id = existing?.id ?? null;
  }
  if (!id) {
    console.warn(`[${jobId}] No product to attribute failure to for URL: ${url}`);
    return;
  }
  try {
    await updateProductFailure(id);
    await logRun({ productId: id, status: "FAILED", errorMessage });
  } catch (err) {
    console.warn(`[${jobId}] Failed to record failure:`, err);
  }
}

/**
 * Job processor for the `update-product-info` operation.
 *
 * Renders + AI-extracts full metadata AND a price in one run, then:
 *  - Success (page processed, price present): append a price record, OVERWRITE
 *    all metadata (found fields stored, missing fields blanked), stamp
 *    info_updated_at + lastSuccessAt, log SUCCESS. "Processed but nothing found"
 *    is still success — fields are blanked and a price is still recorded.
 *  - Total failure (unreachable / extraction error / no price): record the
 *    failure and leave metadata + info_updated_at UNTOUCHED. No partial writes.
 */
export default async function updateProductInfoJob(
  job: Job<UpdateProductInfoJobData>,
): Promise<UpdateProductInfoResult> {
  const { url, productId } = job.data;
  const jobId = String(job.id);

  console.log(`[${jobId}] Processing product-info update for URL: ${url || "(lookup required)"}`);

  const targetUrl = await resolveTargetUrl(url, productId, jobId);
  if (!targetUrl) {
    console.log(`[${jobId}] No URL provided or found, skipping`);
    return { status: "skipped", reason: "no_url" };
  }

  const result = await scrapeProductInfo(targetUrl);

  // Total failure (scrape error or no data): metadata + info_updated_at are
  // left untouched (overwrite only happens on success). Return the scraper's
  // failure verbatim; throw on "success but no data" so BullMQ records a
  // failure (mirrors priceCheck.ts).
  if (!result.success || !result.data) {
    const errorMessage = !result.success
      ? result.error || "Product info extraction failed"
      : "No data extracted from product-info scraper";
    console.error(`[${jobId}] update-product-info failed: ${errorMessage}`);
    await recordFailure(targetUrl, productId, jobId, errorMessage);
    if (!result.success) {
      return result;
    }
    throw new Error(errorMessage);
  }

  const data = result.data;

  // No usable price is also a total failure — leave metadata untouched.
  if (data.price === null) {
    const errorMessage = "Incomplete data: missing price";
    console.error(`[${jobId}] update-product-info failed: ${errorMessage}`);
    await recordFailure(targetUrl, productId, jobId, errorMessage);
    throw new Error(errorMessage);
  }

  // Success: append price + overwrite metadata + stamp timestamps.
  console.log(`[${jobId}] Product-info scrape successful:`, data);

  try {
    const product = await getOrCreateProductByUrl(targetUrl, data.title || "Unknown Product", data.imageUrl);

    await savePriceRecord({ productId: product.id, price: data.price, currency: data.currency });
    await saveProductInfo(product.id, {
      description: data.description,
      category: data.category,
      brand: data.brand,
      countryOfOrigin: data.countryOfOrigin,
      attributes: data.attributes,
    });
    await updateProductTimestamp(product.id);
    await logRun({ productId: product.id, status: "SUCCESS" });

    console.log(`[${jobId}] Product info updated (ID: ${product.id})`);
  } catch (dbError) {
    const errorMessage = formatErrorMessage(dbError);
    console.error(`[${jobId}] Failed to save product info: ${errorMessage}`);
    await recordFailure(targetUrl, productId, jobId, `Database error: ${errorMessage}`);
    throw dbError; // surface to BullMQ for retry
  }

  return result;
}
