import { Queue } from "bullmq";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";

// Extend globalThis for Next.js Hot Reload singleton pattern
interface GlobalWithQueue {
  priceQueue: Queue | undefined;
}

const globalForQueue = globalThis as unknown as GlobalWithQueue;

// Create singleton Queue instance
export const priceQueue =
  globalForQueue.priceQueue ??
  new Queue(QUEUE_NAME, {
    connection: new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    }),
  });

// Preserve instance across hot reloads in development
if (process.env.NODE_ENV !== "production") {
  globalForQueue.priceQueue = priceQueue;
}
