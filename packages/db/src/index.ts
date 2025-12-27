import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';

config({ path: '../../../.env' });
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });

// Re-export schema
export * from './schema';

// Type exports
export type Product = typeof schema.products.$inferSelect;
export type NewProduct = typeof schema.products.$inferInsert;

export type PriceRecord = typeof schema.priceRecords.$inferSelect;
export type NewPriceRecord = typeof schema.priceRecords.$inferInsert;

export type AlertRule = typeof schema.alertRules.$inferSelect;
export type NewAlertRule = typeof schema.alertRules.$inferInsert;

export type RunLog = typeof schema.runLogs.$inferSelect;
export type NewRunLog = typeof schema.runLogs.$inferInsert;
