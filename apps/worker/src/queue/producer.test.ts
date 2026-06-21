import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * producer.enqueueReindex is the live path that schedules an embedding reindex
 * after `update-product-info`. The contract under test: it lazily builds a
 * single Queue over the shared connection, and adds the job using the SHARED
 * name + opts (so it can't drift from the backfill). We mock bullmq's Queue and
 * config so no real Redis connection is opened.
 */

const addMock = vi.fn();
const queueCtor = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string, opts: unknown) {
      queueCtor(name, opts);
    }
    add = addMock;
  },
}));

vi.mock("../config.js", () => ({
  connection: { fake: "connection" },
  QUEUE_NAME: "price-monitor-queue",
}));

import { REINDEX_JOB_OPTS } from "./reindexJob.js";

beforeEach(() => {
  vi.resetModules();
  addMock.mockReset();
  queueCtor.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueReindex", () => {
  it("adds the reindex job with the shared name, productId payload, and shared opts", async () => {
    const { enqueueReindex, REINDEX_JOB_NAME } = await import("./producer.js");

    await enqueueReindex("prod-42");

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(REINDEX_JOB_NAME, { productId: "prod-42" }, REINDEX_JOB_OPTS);
  });

  it("constructs the Queue over the shared connection on the configured queue", async () => {
    const { enqueueReindex } = await import("./producer.js");

    await enqueueReindex("prod-1");

    expect(queueCtor).toHaveBeenCalledWith("price-monitor-queue", { connection: { fake: "connection" } });
  });

  it("reuses a single Queue instance across calls (lazy singleton)", async () => {
    const { enqueueReindex } = await import("./producer.js");

    await enqueueReindex("prod-1");
    await enqueueReindex("prod-2");

    expect(queueCtor).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledTimes(2);
  });
});
