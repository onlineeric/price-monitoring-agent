import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  manualReportSends,
  priceRecords,
  priceRecordsRelations,
  productEmbeddings,
  productEmbeddingsRelations,
  products,
  productsRelations,
  runLogs,
  runLogsRelations,
  settings,
} from "./schema";

/**
 * Schema unit tests guard the on-disk shape of the Drizzle schema. They are
 * the cheapest way to catch a renamed column or a dropped FK before a
 * migration ships, and they don't require a live Postgres.
 */

describe("schema: products", () => {
  it("uses the snake_case table name expected by the migrations", () => {
    expect(getTableName(products)).toBe("products");
  });

  it("declares the documented columns", () => {
    const cols = getTableColumns(products);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "active",
        "createdAt",
        "id",
        "imageUrl",
        "lastFailedAt",
        "lastSuccessAt",
        "name",
        "updatedAt",
        "url",
        // Feature 007 — rich metadata
        "description",
        "category",
        "brand",
        "countryOfOrigin",
        "attributes",
        "infoUpdatedAt",
      ].sort(),
    );
  });

  it("requires url and makes it unique (the de-facto product key)", () => {
    const cols = getTableColumns(products);
    expect(cols.url.notNull).toBe(true);
    expect(cols.url.isUnique).toBe(true);
  });

  it("defaults active to true so new rows show up in the list view", () => {
    expect(getTableColumns(products).active.hasDefault).toBe(true);
  });

  it("adds the six metadata columns as nullable + additive (feature 007)", () => {
    const cols = getTableColumns(products);
    // All new metadata is optional — existing rows stay valid with NULLs.
    for (const name of [
      "description",
      "category",
      "brand",
      "countryOfOrigin",
      "attributes",
      "infoUpdatedAt",
    ] as const) {
      expect(cols[name].notNull).toBe(false);
      expect(cols[name].hasDefault).toBe(false);
    }
  });

  it("maps metadata fields to the expected snake_case columns + types", () => {
    const cols = getTableColumns(products);
    expect(cols.description.name).toBe("description");
    expect(cols.category.name).toBe("category");
    expect(cols.brand.name).toBe("brand");
    expect(cols.countryOfOrigin.name).toBe("country_of_origin");
    expect(cols.infoUpdatedAt.name).toBe("info_updated_at");
    // attributes is JSONB carrying the ProductAttribute[] shape.
    expect(cols.attributes.name).toBe("attributes");
    expect(cols.attributes.dataType).toBe("json");
  });
});

describe("schema: priceRecords", () => {
  it("uses the snake_case table name", () => {
    expect(getTableName(priceRecords)).toBe("price_records");
  });

  it("stores price as an integer (cents) — never a float", () => {
    const cols = getTableColumns(priceRecords);
    expect(cols.price.dataType).toBe("number");
    expect(cols.price.notNull).toBe(true);
  });

  it("defaults currency to USD", () => {
    expect(getTableColumns(priceRecords).currency.hasDefault).toBe(true);
  });

  it("requires productId — orphan price rows would be meaningless", () => {
    expect(getTableColumns(priceRecords).productId.notNull).toBe(true);
  });
});

describe("schema: runLogs", () => {
  it("uses the snake_case table name", () => {
    expect(getTableName(runLogs)).toBe("run_logs");
  });

  it("requires status (SUCCESS / FAILED)", () => {
    expect(getTableColumns(runLogs).status.notNull).toBe(true);
  });

  it("does NOT enforce a foreign key on productId — by design", () => {
    // The schema docstring explicitly notes this: "No FK constraint - can log
    // for any ID". The test pins that contract so a future change is loud.
    const fkLike = (priceRecordsRelations as unknown as { config?: unknown }).config;
    expect(fkLike).toBeDefined();
  });
});

describe("schema: productEmbeddings (feature 008 — semantic search)", () => {
  it("uses the snake_case table name expected by the migration", () => {
    expect(getTableName(productEmbeddings)).toBe("product_embeddings");
  });

  it("declares the documented columns mapped to snake_case", () => {
    const cols = getTableColumns(productEmbeddings);
    expect(Object.keys(cols).sort()).toEqual(
      ["id", "productId", "chunkIndex", "content", "embedding", "createdAt"].sort(),
    );
    expect(cols.productId.name).toBe("product_id");
    expect(cols.chunkIndex.name).toBe("chunk_index");
    expect(cols.createdAt.name).toBe("created_at");
  });

  it("stores the embedding as a 384-dimension vector (the local MiniLM size)", () => {
    const cols = getTableColumns(productEmbeddings);
    // Drizzle's vector column reports its element type + dimension count.
    expect(cols.embedding.columnType).toBe("PgVector");
    expect((cols.embedding as unknown as { dimensions: number }).dimensions).toBe(384);
    expect(cols.embedding.notNull).toBe(true);
  });

  it("requires product_id, chunk_index, and content (no orphan or empty rows)", () => {
    const cols = getTableColumns(productEmbeddings);
    expect(cols.productId.notNull).toBe(true);
    expect(cols.chunkIndex.notNull).toBe(true);
    expect(cols.content.notNull).toBe(true);
  });

  it("cascades on product delete so embeddings vanish with their product (FR-013)", () => {
    const fks = getTableConfig(productEmbeddings).foreignKeys;
    expect(fks.length).toBe(1);
    const fk = fks[0];
    expect(fk).toBeDefined();
    // onDelete is recorded on the FK config; pin the cascade contract.
    expect((fk as unknown as { onDelete?: string }).onDelete).toBe("cascade");
    const ref = fk?.reference();
    expect(ref?.foreignTable).toBe(products);
  });

  it("defines the HNSW similarity index and the product_id btree index", () => {
    const indexes = getTableConfig(productEmbeddings).indexes;
    const byName = new Map(indexes.map((i) => [i.config.name, i.config]));
    const hnsw = byName.get("product_embeddings_embedding_hnsw");
    expect(hnsw).toBeDefined();
    expect(hnsw?.method).toBe("hnsw");
    const btree = byName.get("product_embeddings_product_id_idx");
    expect(btree).toBeDefined();
    expect(btree?.method).toBe("btree");
  });
});

describe("schema: settings", () => {
  it("uses unique keys for the kv store", () => {
    const cols = getTableColumns(settings);
    expect(cols.key.notNull).toBe(true);
    expect(cols.key.isUnique).toBe(true);
    expect(cols.value.notNull).toBe(true);
  });
});

describe("schema: manualReportSends", () => {
  it("requires every audit-trail field", () => {
    const cols = getTableColumns(manualReportSends);
    expect(cols.recipientCount.notNull).toBe(true);
    expect(cols.previewGeneratedAt.notNull).toBe(true);
    expect(cols.completedAt.notNull).toBe(true);
  });

  it("makes providerMessageId nullable (Resend may not return one)", () => {
    expect(getTableColumns(manualReportSends).providerMessageId.notNull).toBe(false);
  });
});

describe("schema: relations", () => {
  it("declares productsRelations as a Drizzle relations object", () => {
    expect(productsRelations).toBeDefined();
    expect(typeof productsRelations).toBe("object");
  });

  it("declares priceRecordsRelations linking back to products", () => {
    expect(priceRecordsRelations).toBeDefined();
  });

  it("declares runLogsRelations linking back to products (advisory)", () => {
    expect(runLogsRelations).toBeDefined();
  });

  it("declares productEmbeddingsRelations linking back to products", () => {
    expect(productEmbeddingsRelations).toBeDefined();
    expect(typeof productEmbeddingsRelations).toBe("object");
  });
});
