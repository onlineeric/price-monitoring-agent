import { Queue } from "bullmq";
import { connection, QUEUE_NAME } from "../config.js";

/**
 * Worker-side queue producer (feature 008, US2).
 *
 * The worker is primarily a consumer, but it also needs to enqueue a
 * `reindex-product-embeddings` job after a successful `update-product-info` (and
 * once per product during the embeddings backfill). This is a small lazy Queue
 * singleton over the shared Redis connection so importing the module is
 * side-effect-free.
 */

export const REINDEX_JOB_NAME = "reindex-product-embeddings";

let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Enqueue a durable, retryable reindex job for one product. Options per
 * `contracts/reindex-job.md`: 5 attempts with exponential backoff so a transient
 * mcp-server outage self-heals; completed jobs are dropped, failed jobs retained
 * (100) for diagnosis.
 */
export async function enqueueReindex(productId: string): Promise<void> {
  await getQueue().add(
    REINDEX_JOB_NAME,
    { productId },
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}
