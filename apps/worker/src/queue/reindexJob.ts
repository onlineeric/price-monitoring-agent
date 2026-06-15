/**
 * Shared identity + retry contract for the `reindex-product-embeddings` job
 * (feature 008, contracts/reindex-job.md).
 *
 * Kept in a side-effect-free module (no imports) so BOTH the live producer
 * (`enqueueReindex`) and the one-time backfill script can import it without
 * pulling in `config.ts`, which eagerly opens a Redis connection at load. The
 * backfill manages its own connection lifecycle, so it must stay isolated.
 */

export const REINDEX_JOB_NAME = "reindex-product-embeddings";

/**
 * 5 attempts with exponential backoff so a transient mcp-server outage
 * self-heals; completed jobs are dropped, failed jobs retained (100) for
 * diagnosis.
 */
export const REINDEX_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 100,
};
