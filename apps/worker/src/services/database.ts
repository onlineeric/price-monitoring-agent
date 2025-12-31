import {
  db,
  products,
  priceRecords,
  runLogs,
  eq,
  type Product,
} from "@price-monitor/db";

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

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
 * Log a run status to the run_logs table
 * Note: This will fail silently if productId doesn't exist (FK constraint)
 */
export async function logRun(params: LogRunParams): Promise<void> {
  // Skip if invalid UUID (can't insert due to FK constraint anyway)
  if (!isValidUuid(params.productId)) {
    console.log(`[DB] Skipping run log - invalid UUID: ${params.productId}`);
    return;
  }

  try {
    await db.insert(runLogs).values({
      productId: params.productId,
      status: params.status,
      errorMessage: params.errorMessage,
    });
  } catch (error) {
    // Log but don't throw - run logging is non-critical
    console.log(`[DB] Could not log run: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
