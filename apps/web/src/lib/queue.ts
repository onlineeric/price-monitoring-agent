import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

const QUEUE_NAME = "price-monitor-queue";

// Extend globalThis for Next.js Hot Reload singleton pattern
interface GlobalWithQueue {
  priceQueue: Queue | undefined;
  priceQueueEvents: QueueEvents | undefined;
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

/**
 * Lazy getter for the QueueEvents singleton.
 *
 * QueueEvents is the Redis stream listener that `Job.waitUntilFinished()` needs
 * to learn when a job completes or fails. Unlike the Queue above, this is cached
 * unconditionally (prod included): it holds a long-lived *blocking* Redis
 * connection that consumes the events stream, so recreating one per request
 * would leak connections. One listener per process is the intended BullMQ usage.
 */
function getPriceQueueEvents(): QueueEvents {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required");
  }

  if (globalForQueue.priceQueueEvents) {
    return globalForQueue.priceQueueEvents;
  }

  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    }),
  });

  globalForQueue.priceQueueEvents = queueEvents;
  return queueEvents;
}

// Export a proxy that lazily initializes the QueueEvents listener.
export const priceQueueEvents = new Proxy({} as QueueEvents, {
  get(_target, prop) {
    const queueEvents = getPriceQueueEvents();
    const value = queueEvents[prop as keyof QueueEvents];
    return typeof value === "function" ? value.bind(queueEvents) : value;
  },
});
