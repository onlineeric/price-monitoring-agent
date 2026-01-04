import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, gt, lt, gte, lte, ne, isNull, isNotNull } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Resolve .env path relative to this file's location (works from any cwd)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import postgres from 'postgres';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });

// Re-export schema
export * from './schema.js';

// Re-export drizzle-orm utilities for use in other packages
export { eq, and, gt, lt, gte, lte, ne, isNull, isNotNull };

// Type exports
export type Product = typeof schema.products.$inferSelect;
export type NewProduct = typeof schema.products.$inferInsert;

export type PriceRecord = typeof schema.priceRecords.$inferSelect;
export type NewPriceRecord = typeof schema.priceRecords.$inferInsert;

export type RunLog = typeof schema.runLogs.$inferSelect;
export type NewRunLog = typeof schema.runLogs.$inferInsert;

export type Setting = typeof schema.settings.$inferSelect;
export type NewSetting = typeof schema.settings.$inferInsert;
