import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/products/[id]/check-price enqueues a per-product price check.
 * Contract:
 *   - 400 if the id is not a valid UUID (bad-input guard, no DB hit)
 *   - 404 when the row is missing
 *   - 200 with the queued jobId on success
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
const queueMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  products: { id: "products.id" },
}));
vi.mock("drizzle-orm", () => ({ eq: (c: unknown, v: unknown) => ({ __op: "eq", c, v }) }));
vi.mock("@/lib/queue", () => ({ priceQueue: { add: queueMock.add } }));

import { POST } from "@/app/api/products/[id]/check-price/route";

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

describe("POST /api/products/[id]/check-price", () => {
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

  it("returns 200 with the queue jobId and forwards the product URL on success", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    queueMock.add.mockResolvedValueOnce({ id: "j-123" });

    const response = await POST({} as never, { params: params(VALID_ID) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, jobId: "j-123" });
    expect(queueMock.add).toHaveBeenCalledWith(
      "check-price",
      expect.objectContaining({ url: "https://shop/x" }),
    );
  });

  it("returns 500 when the queue throws", async () => {
    mockProductLookup({ id: VALID_ID, url: "https://shop/x" });
    queueMock.add.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST({} as never, { params: params(VALID_ID) });
    expect(response.status).toBe(500);
  });
});
