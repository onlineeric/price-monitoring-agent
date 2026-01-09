import {
  db,
  products,
  priceRecords,
  runLogs,
  eq,
  sql,
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
 * Update the product's updatedAt timestamp and lastSuccessAt
 */
export async function updateProductTimestamp(productId: string): Promise<void> {
  await db
    .update(products)
    .set({
      lastSuccessAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(products.id, productId));
}

/**
 * Update the product's lastFailedAt timestamp
 */
export async function updateProductFailure(productId: string): Promise<void> {
  await db
    .update(products)
    .set({
      lastFailedAt: new Date(),
      updatedAt: new Date()
    })
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
 * Only updates name/imageUrl if current values are NULL (preserves user-provided data)
 * Uses ON CONFLICT to prevent race conditions
 */
export async function getOrCreateProductByUrl(
  url: string,
  extractedName: string,
  imageUrl?: string | null
): Promise<Product> {
  try {
    // Atomic insert-or-update using ON CONFLICT
    // If URL exists: conditionally updates name/imageUrl only if needed
    // If URL doesn't exist: inserts new product

    // Build update set with conditional logic:
    // - Only update name if current name is NULL (user didn't provide custom name)
    // - Only update imageUrl if current value is NULL (preserve existing images)
    // - Always update updatedAt timestamp
    const result = await db
      .insert(products)
      .values({
        url,
        name: extractedName,
        imageUrl: imageUrl || null,
        active: false, // Don't include in cron until manually activated
      })
      .onConflictDoUpdate({
        target: products.url,
        set: {
          // Only set name if current value is NULL (preserve user-provided names)
          name: sql`COALESCE(${products.name}, ${extractedName})`,
          // Only set imageUrl if we don't have one yet
          imageUrl: sql`COALESCE(${products.imageUrl}, ${imageUrl})`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const product = result[0];
    if (!product) {
      throw new Error("Failed to create product: no data returned from insert");
    }

    console.log(`[DB] Product ready for URL: ${url} (ID: ${product.id})`);
    return product;
  } catch (error) {
    console.error(`[DB] Error in getOrCreateProductByUrl:`, error);
    throw error;
  }
}
