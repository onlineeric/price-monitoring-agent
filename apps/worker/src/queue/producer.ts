import { Queue } from "bullmq";
import { connection, QUEUE_NAME } from "../config.js";
import { REINDEX_JOB_NAME, REINDEX_JOB_OPTS } from "./reindexJob.js";

/**
 * Worker-side queue producer (feature 008, US2).
 *
 * The worker is primarily a consumer, but it also needs to enqueue a
 * `reindex-product-embeddings` job after a successful `update-product-info` (and
 * once per product during the embeddings backfill). This is a small lazy Queue
 * singleton over the shared Redis connection so importing the module is
 * side-effect-free.
 */

export { REINDEX_JOB_NAME };

let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Enqueue a durable, retryable reindex job for one product. The retry contract
 * (`REINDEX_JOB_OPTS`) is shared with the backfill so the two can't drift.
 */
export async function enqueueReindex(productId: string): Promise<void> {
  await getQueue().add(REINDEX_JOB_NAME, { productId }, REINDEX_JOB_OPTS);
}
