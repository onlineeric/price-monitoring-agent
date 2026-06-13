import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy database connection - only initialized when accessed
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _client = postgres(process.env.DATABASE_URL);
    _db = drizzle(_client, { schema });
  }
  return _db;
}

// Export db as a getter via Proxy to maintain compatibility
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle<typeof schema>>];
  },
});

// Re-export schema
export * from "./schema";

// Re-export the shared product-attribute type + Zod validation
export * from "./attributes";

// NOTE: runMigrations is intentionally NOT re-exported here. It lives behind the
// dedicated "@price-monitor/db/migrate" subpath so the migrator (postgres-js +
// drizzle migrator + a ../drizzle URL) never gets pulled into web's bundle.
// Only the worker imports it.

// Re-export drizzle-orm utilities for use in other packages
export { eq, and, gt, lt, gte, lte, ne, isNull, isNotNull, desc, asc, sql, inArray };

// Type exports
export type Product = typeof schema.products.$inferSelect;
export type NewProduct = typeof schema.products.$inferInsert;

export type PriceRecord = typeof schema.priceRecords.$inferSelect;
export type NewPriceRecord = typeof schema.priceRecords.$inferInsert;

export type RunLog = typeof schema.runLogs.$inferSelect;
export type NewRunLog = typeof schema.runLogs.$inferInsert;

export type Setting = typeof schema.settings.$inferSelect;
export type NewSetting = typeof schema.settings.$inferInsert;

export type ManualReportSend = typeof schema.manualReportSends.$inferSelect;
export type NewManualReportSend = typeof schema.manualReportSends.$inferInsert;
