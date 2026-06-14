import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/products/[id]/update-info enqueues a per-product metadata + price
 * refresh AND waits for the worker to finish (so the client refreshes real, not
 * stale, data). Contract covered here:
 *   - 400 if the id is not a valid UUID (no DB hit)
 *   - 404 when the row is missing
 *   - 200 "completed" when the job resolves with { success: true }
 *   - 422 "failed" when the job resolves with { success: false } (clean failure)
 *   - 422 "failed" when the job rejects (threw: no price / DB error)
 *   - 202 "processing" when the wait times out (job still running)
 *   - 500 when enqueuing itself throws
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
const queueMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  products: { id: "products.id" },
}));
vi.mock("drizzle-orm", () => ({ eq: (c: unknown, v: unknown) => ({ __op: "eq", c, v }) }));
vi.mock("@/lib/queue", () => ({
  priceQueue: { add: queueMock.add },
  priceQueueEvents: { __isQueueEvents: true },
}));

import { POST } from "@/app/api/products/[id]/update-info/route";

const VALID_ID = "00000000-0000-4000-8000-000000000001";
const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  dbMock.select.mockReset();
  queueMock.add.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockProductLookup(row: Record<string, unknown> | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

/** Queue a fake job whose waitUntilFinished resolves/rejects as configured. */
function mockEnqueuedJob(waitUntilFinished: () => Promise<unknown>) {
  queueMock.add.mockResolvedValueOnce({ id: "j-456", waitUntilFinished });
}

describe("POST /api/products/[id]/update-info", () => {
  it("returns 400 without hitting the DB when the id is not a UUID", async () => {
    const response = await POST({} as never, { params: params("not-a-uuid") });
    expect(response.status).toBe(400);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it("returns 404 when the product does not exist", async () => {
    mockProductLookup(null);
    const response = await POST({} as never, { params: params(VALID_ID) });
    expect(response.status).toBe(404);
  });

  it("enqueues update-product-info with the product URL", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.resolve({ success: true }));

    await POST({} as never, { params: params(VALID_ID) });

    expect(queueMock.add).toHaveBeenCalledWith(
      "update-product-info",
      expect.objectContaining({ url: "https://shop/x" }),
    );
  });

  it("returns 200 'completed' when the worker resolves with success", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.resolve({ success: true, data: { title: "X" } }));

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, status: "completed", jobId: "j-456" });
  });

  it("returns 422 'failed' with the message when the worker resolves with a clean failure", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.resolve({ success: false, error: "Page unreachable" }));

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json).toMatchObject({ success: false, status: "failed", error: "Page unreachable" });
  });

  it("returns 422 'failed' when the job rejects (threw)", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.reject(new Error("Incomplete data: missing price")));

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json).toMatchObject({ success: false, status: "failed", error: "Incomplete data: missing price" });
  });

  it("returns 202 'processing' when the wait times out", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.reject(new Error("Job wait update-product-info timed out before finishing")));

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toMatchObject({ success: true, status: "processing", jobId: "j-456" });
  });

  it("treats a job error that merely mentions 'timed out' as a failure, not processing", async () => {
    // A DB/connection error like this is a real failure — it must NOT be masked
    // as "still processing" just because the message contains "timed out". Only
    // BullMQ's own "timed out before finishing" wait-timeout maps to 202.
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    mockEnqueuedJob(() => Promise.reject(new Error("Connection terminated: connection timed out")));

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json).toMatchObject({ success: false, status: "failed" });
  });

  it("returns 500 when the queue throws", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    queueMock.add.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST({} as never, { params: params(VALID_ID) });
    expect(response.status).toBe(500);
  });
});
