import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The database service is the only place that reaches into Drizzle for the
 * worker. Mocking at the @price-monitor/db boundary means we test the
 * orchestration (UUID validation, error swallowing in logRun, ON CONFLICT
 * usage) without standing up Postgres. The chainable Drizzle mock pattern
 * mirrors apps/mcp-server/src/tools/*.test.ts.
 */

const dbMock = vi.hoisted(() => {
  const insert = vi.fn();
  const update = vi.fn();
  const select = vi.fn();
  return {
    insert,
    update,
    select,
    db: { insert, update, select },
  };
});

vi.mock("@price-monitor/db", () => ({
  db: dbMock.db,
  // Identity-ish exports — we only need them to satisfy imports; behaviour is
  // checked via the chained mock builders below.
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
  sql: (parts: TemplateStringsArray, ...vals: unknown[]) => ({ __op: "sql", parts, vals }),
  products: { id: "products.id", url: "products.url", name: "products.name", imageUrl: "products.imageUrl" },
  priceRecords: {},
  runLogs: {},
}));

import {
  getOrCreateProductByUrl,
  getProductById,
  logRun,
  savePriceRecord,
  updateProductFailure,
  updateProductTimestamp,
} from "./database";

beforeEach(() => {
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.select.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("savePriceRecord", () => {
  it("inserts the integer-cents price, productId, and currency", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValueOnce({ values });

    await savePriceRecord({ productId: "p1", price: 1999, currency: "USD" });

    expect(values).toHaveBeenCalledWith({ productId: "p1", price: 1999, currency: "USD" });
  });
});

describe("updateProductTimestamp / updateProductFailure", () => {
  it("stamps lastSuccessAt + updatedAt on the targeted product", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    dbMock.update.mockReturnValueOnce({ set });

    await updateProductTimestamp("p1");

    const setArg = set.mock.calls[0][0] as { lastSuccessAt: Date; updatedAt: Date };
    expect(setArg.lastSuccessAt).toBeInstanceOf(Date);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(where).toHaveBeenCalledWith({ __op: "eq", col: "products.id", val: "p1" });
  });

  it("stamps lastFailedAt + updatedAt on failure", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    dbMock.update.mockReturnValueOnce({ set });

    await updateProductFailure("p1");

    const setArg = set.mock.calls[0][0] as { lastFailedAt: Date };
    expect(setArg.lastFailedAt).toBeInstanceOf(Date);
  });
});

describe("logRun", () => {
  it("writes a SUCCESS log row", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValueOnce({ values });

    await logRun({ productId: "p1", status: "SUCCESS" });

    expect(values).toHaveBeenCalledWith({ productId: "p1", status: "SUCCESS", errorMessage: undefined });
  });

  it("swallows DB errors — run logging is non-critical and must not break the job", async () => {
    const values = vi.fn().mockRejectedValue(new Error("db down"));
    dbMock.insert.mockReturnValueOnce({ values });

    await expect(logRun({ productId: "p1", status: "FAILED", errorMessage: "boom" })).resolves.toBeUndefined();
  });
});

describe("getProductById", () => {
  it("returns null without hitting the DB when the id is not a valid UUID", async () => {
    const result = await getProductById("not-a-uuid");
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("returns the row when found", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000001", url: "https://shop/x" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValueOnce({ from });

    const result = await getProductById("00000000-0000-4000-8000-000000000001");

    expect(result).toEqual({ id: "00000000-0000-4000-8000-000000000001", url: "https://shop/x" });
    expect(from).toHaveBeenCalled();
  });

  it("returns null when no row matches", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValueOnce({ from });

    const result = await getProductById("00000000-0000-4000-8000-000000000002");

    expect(result).toBeNull();
  });

  it("returns null and logs (does not throw) on a DB error", async () => {
    const limit = vi.fn().mockRejectedValue(new Error("boom"));
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValueOnce({ from });

    const result = await getProductById("00000000-0000-4000-8000-000000000003");

    expect(result).toBeNull();
  });
});

describe("getOrCreateProductByUrl", () => {
  it("inserts active=false (manual activation required) and returns the row", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "p-new", url: "https://shop/x" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });

    const product = await getOrCreateProductByUrl("https://shop/x", "Widget", "https://cdn/x.jpg");

    expect(product).toEqual({ id: "p-new", url: "https://shop/x" });
    const valuesArg = values.mock.calls[0][0] as { active: boolean; name: string; imageUrl: string | null };
    expect(valuesArg.active).toBe(false);
    expect(valuesArg.name).toBe("Widget");
    expect(valuesArg.imageUrl).toBe("https://cdn/x.jpg");
    // Conflict target must be the URL — that's the unique key the caller relies on.
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ target: "products.url" }));
  });

  it("normalizes empty/missing imageUrl to null on insert", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "p-new" }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });

    await getOrCreateProductByUrl("https://shop/x", "Widget");

    const valuesArg = values.mock.calls[0][0] as { imageUrl: string | null };
    expect(valuesArg.imageUrl).toBeNull();
  });

  it("throws when the upsert returns no row (defensive guard)", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });

    await expect(getOrCreateProductByUrl("https://shop/x", "Widget")).rejects.toThrow(/no data returned/);
  });
});
