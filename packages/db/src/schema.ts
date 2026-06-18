import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import type { ProductAttribute } from "./attributes";

// Products table
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull().unique(),
  name: text("name"), // Nullable - will be filled by scraper if not provided
  imageUrl: text("image_url"),
  active: boolean("active").default(true),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailedAt: timestamp("last_failed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // --- Rich product metadata (feature 007) -------------------------------
  // All additive + nullable. Populated only by the `update-product-info`
  // operation (AI tier); never touched by the cheap `check-price` path.
  description: text("description"),
  category: text("category"),
  brand: text("brand"),
  countryOfOrigin: text("country_of_origin"),
  // Ordered key/value spec list, capped at 100 (see packages/db/src/attributes.ts).
  attributes: jsonb("attributes").$type<ProductAttribute[]>(),
  // When metadata was last extracted — distinct from last_success_at (price).
  infoUpdatedAt: timestamp("info_updated_at"),
});

// Price records table
export const priceRecords = pgTable("price_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  price: integer("price").notNull(),
  currency: text("currency").default("USD"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

// Product embeddings table (feature 008 — semantic product search / RAG)
// One row per (product, chunk). A short product has exactly one row; a long
// product (big description + many specs) has several. This is the indexable
// shape — pgvector's HNSW index works on a single `vector` column, so an
// array-of-vectors column is not an option. Populated only by the reindex
// operation (delete-and-replace per product); never touched by price checks.
export const productEmbeddings = pgTable(
  "product_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // 0-based position of the chunk within the product's composite document.
    chunkIndex: integer("chunk_index").notNull(),
    // The exact text embedded for this row (chunk + identity prefix). Stored
    // for debuggability and so the agent can cite the matched fragment.
    content: text("content").notNull(),
    // MiniLM int8 embedding in cosine space. Dimension fixed by the local
    // model; a provider switch resizes this column (deliberate migration).
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    // HNSW similarity index (cosine). The search query orders by cosineDistance.
    index("product_embeddings_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    // btree to speed delete-and-replace, per-product dedup, and the FK cascade.
    index("product_embeddings_product_id_idx").on(t.productId),
  ],
);

// Run logs table
export const runLogs = pgTable("run_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(), // No FK constraint - can log for any ID
  status: text("status").notNull(), // 'SUCCESS' | 'FAILED'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Settings table - general purpose key-value store
export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON string
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Completed manual report sends ledger
export const manualReportSends = pgTable("manual_report_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientCount: integer("recipient_count").notNull(),
  previewGeneratedAt: timestamp("preview_generated_at").notNull(),
  providerMessageId: text("provider_message_id"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  priceRecords: many(priceRecords),
  runLogs: many(runLogs),
  embeddings: many(productEmbeddings),
}));

export const productEmbeddingsRelations = relations(productEmbeddings, ({ one }) => ({
  product: one(products, {
    fields: [productEmbeddings.productId],
    references: [products.id],
  }),
}));

export const priceRecordsRelations = relations(priceRecords, ({ one }) => ({
  product: one(products, {
    fields: [priceRecords.productId],
    references: [products.id],
  }),
}));

export const runLogsRelations = relations(runLogs, ({ one }) => ({
  // Note: Product may not exist (no FK constraint), relation is optional
  product: one(products, {
    fields: [runLogs.productId],
    references: [products.id],
  }),
}));
