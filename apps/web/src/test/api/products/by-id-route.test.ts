import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/products/[id] handles fetch / patch / delete on a single product. We
 * pin: 404 propagation when the row is missing, the PATCH "trim name; empty
 * → undefined" rule (which lets the user clear a name back to null without
 * resetting active), and the active boolean type guard.
 */

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

// GET delegates to the shared stats helper (009); mock it at that boundary so
// this route test stays decoupled from the helper's internal query shape (the
// helper has its own dedicated test).
const statsMock = vi.hoisted(() => ({ getProductWithStats: vi.fn() }));

vi.mock("@/lib/products/product-stats", () => statsMock);

vi.mock("@price-monitor/db", () => ({
  db: dbMock,
  products: { id: "products.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
}));

import { DELETE, GET, PATCH } from "@/app/api/products/[id]/route";

function patchRequest(body: unknown) {
  return new Request("http://test/api/products/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.update.mockReset();
  dbMock.delete.mockReset();
  statsMock.getProductWithStats.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/products/[id]", () => {
  it("returns the enriched ProductWithStats when found (incl. backwards-compatible fields)", async () => {
    const enriched = {
      id: "p1",
      url: "https://shop/x",
      name: "Widget",
      active: true,
      updatedAt: new Date("2026-06-16T00:00:00Z"),
      currentPrice: 58500,
      currency: "NZD",
      lastChecked: new Date("2026-06-16T00:00:00Z"),
      priceHistory: [{ date: new Date("2026-06-01T00:00:00Z"), price: 60000 }],
    };
    statsMock.getProductWithStats.mockResolvedValueOnce(enriched);

    const response = await GET({} as never, { params: params("p1") });
    const json = await response.json();

    expect(statsMock.getProductWithStats).toHaveBeenCalledWith("p1");
    expect(response.status).toBe(200);
    // Stats surfaced for the detail dialog...
    expect(json.product.currentPrice).toBe(58500);
    expect(json.product.priceHistory).toHaveLength(1);
    // ...and the fields existing consumers (global product search) rely on are
    // still present.
    expect(json.product).toMatchObject({ id: "p1", name: "Widget", url: "https://shop/x", active: true });
  });

  it("returns 404 when the product is missing", async () => {
    statsMock.getProductWithStats.mockResolvedValueOnce(null);

    const response = await GET({} as never, { params: params("p-missing") });
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/products/[id]", () => {
  function mockUpdateReturning(row: Record<string, unknown> | null) {
    const returning = vi.fn().mockResolvedValue(row ? [row] : []);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock.update.mockReturnValueOnce({ set });
    return set;
  }

  it("trims a provided name on update", async () => {
    const set = mockUpdateReturning({ id: "p1", name: "Widget" });

    await PATCH(patchRequest({ name: "  Widget  " }) as never, { params: params("p1") });

    const updateData = set.mock.calls[0][0] as { name: string };
    expect(updateData.name).toBe("Widget");
  });

  it("treats an empty-string name as 'unset' (so the column can be cleared back to null)", async () => {
    const set = mockUpdateReturning({ id: "p1" });

    await PATCH(patchRequest({ name: "" }) as never, { params: params("p1") });

    const updateData = set.mock.calls[0][0] as { name: string | undefined };
    expect(updateData.name).toBeUndefined();
  });

  it("only writes `active` when it is a boolean (ignores stringly-typed inputs)", async () => {
    const set = mockUpdateReturning({ id: "p1" });

    await PATCH(patchRequest({ active: "yes" }) as never, { params: params("p1") });

    const updateData = set.mock.calls[0][0] as { active?: boolean };
    expect(updateData.active).toBeUndefined();
  });

  it("returns 404 when no row matches the id", async () => {
    mockUpdateReturning(null);

    const response = await PATCH(patchRequest({ active: true }) as never, { params: params("p-missing") });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/products/[id]", () => {
  it("returns 200 when the row is deleted (cascade handles related records)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock.delete.mockReturnValueOnce({ where });

    const response = await DELETE({} as never, { params: params("p1") });
    expect(response.status).toBe(200);
  });

  it("returns 404 when the row was not present", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock.delete.mockReturnValueOnce({ where });

    const response = await DELETE({} as never, { params: params("p-missing") });
    expect(response.status).toBe(404);
  });
});
