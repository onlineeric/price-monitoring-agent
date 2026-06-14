import { getProductById } from "../services/database.js";

/** Format an unknown thrown value into a log-friendly message. */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Resolve the target URL for a job from its data.
 *
 * URL-first (modern): the URL is provided directly. Falls back to a productId
 * lookup (legacy) when no URL is given. Returns null when neither yields a URL.
 *
 * Shared by priceCheck and updateProductInfo so the resolution logic lives in
 * exactly one place.
 */
export async function resolveTargetUrl(
  url: string | undefined,
  productId: string | undefined,
  jobId: string,
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
