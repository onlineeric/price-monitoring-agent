import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Redis } from "ioredis";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

// Redis connection instance (reusable across the worker)
// maxRetriesPerRequest: null is required by BullMQ
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is required");
}
export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Queue name must match the producer (Web App)
export const QUEUE_NAME = "price-monitor-queue";
