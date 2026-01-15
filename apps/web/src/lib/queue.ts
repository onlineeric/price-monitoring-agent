import { Queue } from "bullmq";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";

// Extend globalThis for Next.js Hot Reload singleton pattern
interface GlobalWithQueue {
  priceQueue: Queue | undefined;
}

const globalForQueue = globalThis as unknown as GlobalWithQueue;

/**
 * Lazy getter for the price queue singleton.
 * Only validates REDIS_URL and creates the queue when first accessed (at runtime).
 * This prevents build-time errors when REDIS_URL isn't available.
 */
function getPriceQueue(): Queue {
  // Validate required environment variables (only at runtime)
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required");
  }

  // Return cached instance if it exists
  if (globalForQueue.priceQueue) {
    return globalForQueue.priceQueue;
  }

  // Create new instance
  const queue = new Queue(QUEUE_NAME, {
    connection: new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    }),
  });

  // Cache for hot reload in development
  if (process.env.NODE_ENV !== "production") {
    globalForQueue.priceQueue = queue;
  }

  return queue;
}

// Export a proxy that lazily initializes the queue
export const priceQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    const queue = getPriceQueue();
    const value = queue[prop as keyof Queue];
    return typeof value === "function" ? value.bind(queue) : value;
  },
});
