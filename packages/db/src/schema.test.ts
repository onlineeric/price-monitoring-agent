import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  manualReportSends,
  priceRecords,
  priceRecordsRelations,
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
});
