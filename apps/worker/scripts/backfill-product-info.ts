import { fileURLToPath } from "node:url";
import { db, products } from "@price-monitor/db";
import { Queue } from "bullmq";
import { config } from "dotenv";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";

/** Minimal queue surface the backfill needs — eases testing with a mock. */
interface EnqueueOnly {
  add: (name: string, data: unknown) => Promise<unknown>;
}

/**
 * One-time backfill: enqueue an `update-product-info` job for every product so
 * existing (pre-feature) rows gain rich metadata + `info_updated_at`.
 *
 * Idempotent by construction — the job uses overwrite semantics, so re-running
 * simply refreshes each product with no duplicate side effects beyond a fresh
 * price record + re-extracted metadata (FR-019, SC-005). Exported for testing.
 *
 * @returns the number of jobs enqueued
 */
export async function backfillProductInfo(queue: EnqueueOnly): Promise<number> {
  const allProducts = await db.select().from(products);
  console.log(`[backfill] Found ${allProducts.length} product(s) to enrich`);

  for (const product of allProducts) {
    await queue.add("update-product-info", { url: product.url, triggeredAt: new Date() });
    console.log(`[backfill] Enqueued update-product-info for ${product.url}`);
  }

  console.log(`[backfill] Done. Enqueued ${allProducts.length} job(s).`);
  return allProducts.length;
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });
  try {
    await backfillProductInfo(queue);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

// Run when invoked directly: `pnpm --filter @price-monitor/worker backfill:product-info`.
// Loads the monorepo root .env so DATABASE_URL / REDIS_URL are available.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
  main().catch((error) => {
    console.error("[backfill] Failed:", error);
    process.exit(1);
  });
}
