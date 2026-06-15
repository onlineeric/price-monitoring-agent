import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * reindexProduct loads a product, builds → chunks → embeds, then delete-and-
 * replaces its rows in ONE transaction (FR-012). We mock the DB (transaction +
 * findFirst), the chunker, and the provider so we test orchestration + atomic
 * ordering, not Postgres or the model.
 */

const order: string[] = [];

const dbMock = vi.hoisted(() => {
  const findFirst = vi.fn();
  const insertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: insertValues }));
  const deleteWhere = vi.fn();
  const txDelete = vi.fn(() => ({ where: deleteWhere }));
  const transaction = vi.fn();
  return { findFirst, insertValues, txInsert, deleteWhere, txDelete, transaction };
});

const providerMock = vi.hoisted(() => ({ embedTexts: vi.fn() }));
const chunkMock = vi.hoisted(() => ({ chunk: vi.fn() }));
const documentMock = vi.hoisted(() => ({
  buildDocument: vi.fn(() => "DOC"),
  buildIdentityPrefix: vi.fn(() => "PREFIX"),
}));

vi.mock("@price-monitor/db", () => ({
  db: {
    query: { products: { findFirst: dbMock.findFirst } },
    transaction: dbMock.transaction,
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  productEmbeddings: { productId: { name: "product_id" } },
  products: { id: { name: "id" } },
}));
vi.mock("./provider.js", () => providerMock);
vi.mock("./chunk.js", () => chunkMock);
vi.mock("./document.js", () => documentMock);

import { ProductNotFoundError, reindexProduct } from "./reindex";

const PRODUCT = {
  name: "UltraView 27",
  brand: "Acme",
  category: "Monitors",
  countryOfOrigin: "Taiwan",
  description: "desc",
  attributes: [{ key: "Panel", value: "IPS" }],
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();

  // delete + insert record their relative order so we can assert delete-first.
  dbMock.deleteWhere.mockImplementation(async () => {
    order.push("delete");
  });
  dbMock.insertValues.mockImplementation(async () => {
    order.push("insert");
  });
  // transaction invokes the callback with a tx that records the boundaries.
  dbMock.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    order.push("tx-begin");
    await cb({ delete: dbMock.txDelete, insert: dbMock.txInsert });
    order.push("tx-end");
  });

  documentMock.buildDocument.mockReturnValue("DOC");
  documentMock.buildIdentityPrefix.mockReturnValue("PREFIX");
  // embedTexts returns one fixed vector per input chunk.
  providerMock.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reindexProduct", () => {
  it("builds rows from chunks and inserts them after deleting, in one transaction", async () => {
    dbMock.findFirst.mockResolvedValueOnce(PRODUCT);
    chunkMock.chunk.mockResolvedValueOnce(["chunk 0", "chunk 1"]);

    const count = await reindexProduct("prod-1");

    expect(count).toBe(2);
    expect(documentMock.buildDocument).toHaveBeenCalledWith(PRODUCT);
    expect(chunkMock.chunk).toHaveBeenCalledWith("DOC", "PREFIX");
    expect(providerMock.embedTexts).toHaveBeenCalledWith(["chunk 0", "chunk 1"]);
    expect(dbMock.insertValues).toHaveBeenCalledWith([
      { productId: "prod-1", chunkIndex: 0, content: "chunk 0", embedding: [0.1, 0.2, 0.3] },
      { productId: "prod-1", chunkIndex: 1, content: "chunk 1", embedding: [0.1, 0.2, 0.3] },
    ]);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
  });

  it("runs delete BEFORE insert, both inside the transaction (atomic swap)", async () => {
    dbMock.findFirst.mockResolvedValueOnce(PRODUCT);
    chunkMock.chunk.mockResolvedValueOnce(["only chunk"]);

    await reindexProduct("prod-1");

    expect(order).toEqual(["tx-begin", "delete", "insert", "tx-end"]);
  });

  it("yields ≥1 row for a name-only product", async () => {
    dbMock.findFirst.mockResolvedValueOnce({ ...PRODUCT, brand: null, category: null, description: null, attributes: null });
    chunkMock.chunk.mockResolvedValueOnce(["UltraView 27"]);

    const count = await reindexProduct("prod-1");
    expect(count).toBe(1);
    expect(dbMock.insertValues).toHaveBeenCalledTimes(1);
  });

  it("clears stale rows but skips insert when there is nothing to embed", async () => {
    dbMock.findFirst.mockResolvedValueOnce(PRODUCT);
    chunkMock.chunk.mockResolvedValueOnce([]);

    const count = await reindexProduct("prod-1");

    expect(count).toBe(0);
    expect(order).toEqual(["tx-begin", "delete", "tx-end"]);
    expect(dbMock.insertValues).not.toHaveBeenCalled();
  });

  it("throws ProductNotFoundError (no transaction) for an unknown product", async () => {
    dbMock.findFirst.mockResolvedValueOnce(undefined);

    await expect(reindexProduct("ghost")).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
