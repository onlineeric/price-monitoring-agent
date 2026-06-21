import { describe, expect, it } from "vitest";

import { REINDEX_JOB_NAME, REINDEX_JOB_OPTS } from "./reindexJob.js";

/**
 * reindexJob defines the durable identity + retry contract shared by the live
 * producer and the one-time backfill. These constants ARE the contract — if
 * they drift, the two enqueue paths silently disagree on retry behaviour, so
 * we pin the exact values here (contracts/reindex-job.md, feature 008).
 */

describe("reindex job contract", () => {
  it("uses the agreed job name", () => {
    expect(REINDEX_JOB_NAME).toBe("reindex-product-embeddings");
  });

  it("retries 5 times with exponential 5s backoff", () => {
    expect(REINDEX_JOB_OPTS.attempts).toBe(5);
    expect(REINDEX_JOB_OPTS.backoff).toEqual({ type: "exponential", delay: 5000 });
  });

  it("drops completed jobs and retains the last 100 failures for diagnosis", () => {
    expect(REINDEX_JOB_OPTS.removeOnComplete).toBe(true);
    expect(REINDEX_JOB_OPTS.removeOnFail).toBe(100);
  });
});
