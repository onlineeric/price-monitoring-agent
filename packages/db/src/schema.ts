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
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  active: boolean('active').default(true),
  schedule: text('schedule').default('0 9 * * *'),
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

// Alert rules table
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  targetPrice: integer('target_price').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Run logs table
export const runLogs = pgTable('run_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'SUCCESS' | 'FAILED'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  priceRecords: many(priceRecords),
  alertRules: many(alertRules),
  runLogs: many(runLogs),
}));

export const priceRecordsRelations = relations(priceRecords, ({ one }) => ({
  product: one(products, {
    fields: [priceRecords.productId],
    references: [products.id],
  }),
}));

export const alertRulesRelations = relations(alertRules, ({ one }) => ({
  product: one(products, {
    fields: [alertRules.productId],
    references: [products.id],
  }),
}));

export const runLogsRelations = relations(runLogs, ({ one }) => ({
  product: one(products, {
    fields: [runLogs.productId],
    references: [products.id],
  }),
}));
