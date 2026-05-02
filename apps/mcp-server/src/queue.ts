import { Queue } from "bullmq";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";

let cachedQueue: Queue | null = null;

/**
 * Lazy singleton for the shared price-monitor BullMQ queue.
 * Connection is opened on first access so importing this module has no
 * side effects — important for stdio servers where startup must not fail
 * if Redis is briefly unreachable at boot.
 */
export function getPriceQueue(): Queue {
  if (cachedQueue) return cachedQueue;

  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required");
  }

  cachedQueue = new Queue(QUEUE_NAME, {
    connection: new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    }),
  });

  return cachedQueue;
}
