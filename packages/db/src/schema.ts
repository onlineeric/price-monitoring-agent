import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Products table
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull().unique(),
  name: text('name'), // Nullable - will be filled by scraper if not provided
  imageUrl: text('image_url'),
  active: boolean('active').default(true),
  lastSuccessAt: timestamp('last_success_at'),
  lastFailedAt: timestamp('last_failed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Price records table
export const priceRecords = pgTable('price_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  price: integer('price').notNull(),
  currency: text('currency').default('USD'),
  scrapedAt: timestamp('scraped_at').defaultNow(),
});

// Run logs table
export const runLogs = pgTable('run_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull(), // No FK constraint - can log for any ID
  status: text('status').notNull(), // 'SUCCESS' | 'FAILED'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Settings table - general purpose key-value store
export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(), // JSON string
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  priceRecords: many(priceRecords),
  runLogs: many(runLogs),
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
