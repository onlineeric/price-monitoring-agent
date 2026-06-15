import { fileURLToPath } from "node:url";
import { db, products } from "@price-monitor/db";
import { Queue } from "bullmq";
import { config } from "dotenv";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";
const REINDEX_JOB_NAME = "reindex-product-embeddings";

// Job options mirror the reindex producer (contracts/reindex-job.md) so a
// backfilled job retries with backoff exactly like a live one.
const REINDEX_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

/** Minimal queue surface the backfill needs — eases testing with a mock. */
interface EnqueueOnly {
  add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
}

/**
 * One-time backfill: enqueue a `reindex-product-embeddings` job for every
 * product so the whole existing catalog becomes semantically searchable.
 *
 * Idempotent by construction — the reindex endpoint delete-and-replaces each
 * product's rows, so re-running just rebuilds with no duplicates (FR-017). Run
 * `backfill:product-info` FIRST so products have metadata to embed (FR-016).
 * Holds no model — it only enqueues (the mcp-server does the embedding).
 * Exported for testing.
 *
 * @returns the number of jobs enqueued
 */
export async function backfillEmbeddings(queue: EnqueueOnly): Promise<number> {
  const allProducts = await db.select({ id: products.id }).from(products);
  console.log(`[backfill:embeddings] Found ${allProducts.length} product(s) to reindex`);

  for (const product of allProducts) {
    await queue.add(REINDEX_JOB_NAME, { productId: product.id }, REINDEX_JOB_OPTS);
    console.log(`[backfill:embeddings] Enqueued reindex for ${product.id}`);
  }

  console.log(`[backfill:embeddings] Done. Enqueued ${allProducts.length} job(s).`);
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
    await backfillEmbeddings(queue);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

// Run when invoked directly: `pnpm --filter @price-monitor/worker backfill:embeddings`.
// Loads the monorepo root .env so DATABASE_URL / REDIS_URL are available.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
  main().catch((error) => {
    console.error("[backfill:embeddings] Failed:", error);
    process.exit(1);
  });
}
