import {
  db,
  products,
  priceRecords,
  runLogs,
  eq,
  type Product,
} from "@price-monitor/db";
import { validate as isValidUuid } from "uuid";

/**
 * Parameters for saving a price record
 */
interface SavePriceParams {
  productId: string;
  price: number; // In cents
  currency: string;
}

/**
 * Parameters for logging a run
 */
interface LogRunParams {
  productId: string;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
}

/**
 * Save a new price record to the database
 */
export async function savePriceRecord(params: SavePriceParams): Promise<void> {
  await db.insert(priceRecords).values({
    productId: params.productId,
    price: params.price,
    currency: params.currency,
  });
}

/**
 * Update the product's updatedAt timestamp
 */
export async function updateProductTimestamp(productId: string): Promise<void> {
  await db
    .update(products)
    .set({ updatedAt: new Date() })
    .where(eq(products.id, productId));
}

/**
 * Format error message for logging
 */
function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Log a run status to the run_logs table
 * No FK constraint - can log for any productId (including test IDs)
 */
export async function logRun(params: LogRunParams): Promise<void> {
  try {
    await db.insert(runLogs).values({
      productId: params.productId,
      status: params.status,
      errorMessage: params.errorMessage,
    });
  } catch (error) {
    // Log but don't throw - run logging is non-critical
    console.log(`[DB] Could not log run: ${formatErrorMessage(error)}`);
  }
}

/**
 * Get a product by ID
 * Returns null if product not found or ID is invalid
 */
export async function getProductById(
  productId: string
): Promise<Product | null> {
  // Validate UUID format first
  if (!isValidUuid(productId)) {
    console.log(`[DB] Invalid UUID format: ${productId}`);
    return null;
  }

  try {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    console.error(`[DB] Error fetching product:`, error);
    return null;
  }
}

/**
 * Get or create product by URL
 * Returns existing product if URL exists, creates new one if not
 * New products are created with active=false (must be manually activated for cron)
 */
export async function getOrCreateProductByUrl(
  url: string,
  extractedName: string
): Promise<Product> {
  try {
    // Try to find existing product by URL
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.url, url))
      .limit(1);

    if (existing[0]) {
      console.log(`[DB] Found existing product for URL: ${url}`);
      return existing[0];
    }

    // Create new product
    console.log(`[DB] Creating new product for URL: ${url}`);
    const result = await db
      .insert(products)
      .values({
        url,
        name: extractedName,
        active: false, // Don't include in cron until manually activated
      })
      .returning();

    const newProduct = result[0];
    if (!newProduct) {
      throw new Error("Failed to create product: no data returned from insert");
    }

    return newProduct;
  } catch (error) {
    console.error(`[DB] Error in getOrCreateProductByUrl:`, error);
    throw error;
  }
}
