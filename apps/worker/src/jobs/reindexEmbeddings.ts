import type { Job } from "bullmq";
import { MCP_REINDEX_URL } from "../config.js";

/**
 * `reindex-product-embeddings` job handler (feature 008, US2).
 *
 * The durable bridge from "metadata changed" to "embeddings rebuilt". It holds
 * NO model and does NO embedding — it makes a single HTTP call to the
 * mcp-server's internal reindex endpoint (the single embedding authority), so
 * the worker's RAM budget is untouched.
 *
 * Failure handling distinguishes transient from permanent:
 *  - network error or a 5xx → rethrow so BullMQ retries with backoff
 *    (contract: reindex-job.md);
 *  - 400 (bad productId) / 404 (product already deleted — its embeddings were
 *    cascade-removed) → terminal: log and resolve, since retrying can never
 *    succeed and would only churn the queue with spurious failures;
 *  - 2xx → resolve, logging the chunk count.
 */

interface ReindexJobData {
  productId: string;
}

/**
 * Hard ceiling on the reindex HTTP round-trip. Generous enough to cover an
 * mcp-server cold start (lazy embedding-model load can take tens of seconds) but
 * bounded so a hung/half-open connection can't pin the job — and with the
 * worker's default concurrency, the whole queue — indefinitely. A timeout aborts
 * the fetch and is handled as a transient failure (BullMQ retries with backoff).
 */
const REINDEX_REQUEST_TIMEOUT_MS = 120_000;

export default async function reindexEmbeddingsJob(job: Job<ReindexJobData>): Promise<{ productId: string; chunks: number }> {
  const { productId } = job.data;
  const jobId = String(job.id);

  let response: Response;
  try {
    response = await fetch(MCP_REINDEX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
      signal: AbortSignal.timeout(REINDEX_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error (mcp-server down/unreachable) or a request timeout — throw so
    // BullMQ retries with backoff.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] reindex request failed (network): ${message}`);
    throw new Error(`reindex request to ${MCP_REINDEX_URL} failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // 400 (bad productId) and 404 (product already deleted) are permanent —
    // retrying can never succeed and just churns the queue with backoff retries
    // and failed-job noise. Resolve as a no-op; only 5xx/network errors retry.
    if (response.status === 400 || response.status === 404) {
      console.warn(`[${jobId}] reindex skipped (terminal HTTP ${response.status}): ${body}`);
      return { productId, chunks: 0 };
    }
    console.error(`[${jobId}] reindex non-2xx: HTTP ${response.status} ${body}`);
    throw new Error(`reindex returned HTTP ${response.status}`);
  }

  const result = (await response.json().catch(() => ({}))) as { chunks?: number };
  const chunks = typeof result.chunks === "number" ? result.chunks : 0;
  console.log(`[${jobId}] reindex productId=${productId} chunks=${chunks}`);
  return { productId, chunks };
}
