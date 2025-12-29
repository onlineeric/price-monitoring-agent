import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "ioredis";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

// Redis connection instance (reusable across the worker)
// maxRetriesPerRequest: null is required by BullMQ
export const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Queue name must match the producer (Web App)
export const QUEUE_NAME = "price-monitor-queue";
