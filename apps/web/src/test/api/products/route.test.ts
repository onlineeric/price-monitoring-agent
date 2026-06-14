import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/products and POST /api/products are the dashboard's only write
 * surface for adding products. Pin: URL validation, duplicate detection
 * (HTTP 409), normalized empty name → null, queue-failure handling that does
 * NOT roll back the DB row, and error surface shape on a generic failure.
 */

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

const queueMock = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select, insert: dbMock.insert },
  products: { id: "products.id", url: "products.url" },
}));

vi.mock("drizzle-orm", () => ({
  desc: (col: unknown) => ({ __op: "desc", col }),
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
}));

vi.mock("@/lib/queue", () => ({ priceQueue: { add: queueMock.add } }));

import { GET, POST } from "@/app/api/products/route";

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  queueMock.add.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/products", () => {
  it("returns the product list ordered by createdAt desc", async () => {
    const orderBy = vi.fn().mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    const from = vi.fn().mockReturnValue({ orderBy });
    dbMock.select.mockReturnValueOnce({ from });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, products: [{ id: "p1" }, { id: "p2" }] });
  });

  it("returns 500 with an error payload on DB failure", async () => {
    const orderBy = vi.fn().mockRejectedValue(new Error("db down"));
    const from = vi.fn().mockReturnValue({ orderBy });
    dbMock.select.mockReturnValueOnce({ from });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("db down");
  });
});

describe("POST /api/products", () => {
  function mockNoExistingProduct() {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValueOnce({ from });
  }

  function mockExistingProduct(row: Record<string, unknown>) {
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValueOnce({ from });
  }

  function mockInsertReturning(row: Record<string, unknown>) {
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValueOnce({ values });
    return values;
  }

  it("rejects requests without a URL with 400", async () => {
    const response = await POST(makeRequest({}) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "URL is required" });
  });

  it("rejects malformed URLs with 400", async () => {
    const response = await POST(makeRequest({ url: "not-a-url" }) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid URL format" });
  });

  it("returns 409 when the URL already exists, with the existing product attached", async () => {
    mockExistingProduct({ id: "p-existing", url: "https://shop/x" });

    const response = await POST(makeRequest({ url: "https://shop/x" }) as never);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.product).toEqual({ id: "p-existing", url: "https://shop/x" });
  });

  it("normalizes empty/whitespace name to null on insert", async () => {
    mockNoExistingProduct();
    const values = mockInsertReturning({ id: "p-new", url: "https://shop/x" });
    queueMock.add.mockResolvedValueOnce({ id: "j1" });

    await POST(makeRequest({ url: "https://shop/x", name: "   " }) as never);

    const insertedRow = values.mock.calls[0][0] as { name: string | null };
    expect(insertedRow.name).toBeNull();
  });

  it("trims a provided name and inserts active=true", async () => {
    mockNoExistingProduct();
    const values = mockInsertReturning({ id: "p-new", url: "https://shop/x" });
    queueMock.add.mockResolvedValueOnce({ id: "j1" });

    await POST(makeRequest({ url: "https://shop/x", name: "  Widget  " }) as never);

    const insertedRow = values.mock.calls[0][0] as { name: string; active: boolean };
    expect(insertedRow.name).toBe("Widget");
    expect(insertedRow.active).toBe(true);
  });

  it("enqueues an update-product-info job carrying the new URL so new products start enriched", async () => {
    mockNoExistingProduct();
    mockInsertReturning({ id: "p-new", url: "https://shop/x" });
    queueMock.add.mockResolvedValueOnce({ id: "j1" });

    const response = await POST(makeRequest({ url: "https://shop/x" }) as never);

    expect(response.status).toBe(200);
    expect(queueMock.add).toHaveBeenCalledWith(
      "update-product-info",
      expect.objectContaining({ url: "https://shop/x" }),
    );
  });

  it("returns 503 when the queue fails — does NOT delete the product to avoid a worker race", async () => {
    mockNoExistingProduct();
    mockInsertReturning({ id: "p-new", url: "https://shop/x" });
    queueMock.add.mockRejectedValueOnce(new Error("redis down"));

    const response = await POST(makeRequest({ url: "https://shop/x" }) as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false });
  });
});
