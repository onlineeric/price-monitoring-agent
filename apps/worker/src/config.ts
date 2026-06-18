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

// Full URL of the mcp-server's internal reindex endpoint (feature 008). The
// `reindex-product-embeddings` job handler POSTs `{ productId }` here so the
// mcp-server (the single embedding authority) rebuilds the product's vectors.
// A dedicated, full-URL var (not the web app's MCP_HTTP_URL, which points at
// the `/mcp` JSON-RPC endpoint) keeps the target unambiguous. Dev default
// below; the worker-in-Docker value is set in docker-compose.yml.
export const MCP_REINDEX_URL = process.env.MCP_REINDEX_URL || "http://localhost:3002/internal/reindex";
