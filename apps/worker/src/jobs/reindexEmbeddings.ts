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
 * A non-2xx response or a network error is rethrown so BullMQ retries with
 * backoff (contract: reindex-job.md); a 2xx logs the chunk count.
 */

interface ReindexJobData {
  productId: string;
}

export default async function reindexEmbeddingsJob(job: Job<ReindexJobData>): Promise<{ productId: string; chunks: number }> {
  const { productId } = job.data;
  const jobId = String(job.id);

  let response: Response;
  try {
    response = await fetch(MCP_REINDEX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
  } catch (err) {
    // Network error (mcp-server down/unreachable) — throw so BullMQ retries.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] reindex request failed (network): ${message}`);
    throw new Error(`reindex request to ${MCP_REINDEX_URL} failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[${jobId}] reindex non-2xx: HTTP ${response.status} ${body}`);
    throw new Error(`reindex returned HTTP ${response.status}`);
  }

  const result = (await response.json().catch(() => ({}))) as { chunks?: number };
  const chunks = typeof result.chunks === "number" ? result.chunks : 0;
  console.log(`[${jobId}] reindex productId=${productId} chunks=${chunks}`);
  return { productId, chunks };
}
