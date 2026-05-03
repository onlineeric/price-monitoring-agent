import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The db package exposes a lazy Proxy around drizzle so consumers can import
 * `db` without forcing a Postgres connection at module-load time. These tests
 * pin that lazy-init behavior — a regression here would cause the worker
 * (which loads the package early) to crash before it can validate env.
 */

describe("db package: lazy connection contract", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("does NOT throw at import time even if DATABASE_URL is unset", async () => {
    await expect(import("./index")).resolves.toBeDefined();
  });

  it("re-exports drizzle-orm operators (eq, and, sql, etc.) — chat-tools rely on these", async () => {
    const mod = await import("./index");
    expect(typeof mod.eq).toBe("function");
    expect(typeof mod.and).toBe("function");
    expect(typeof mod.gte).toBe("function");
    expect(typeof mod.desc).toBe("function");
    expect(typeof mod.asc).toBe("function");
    expect(typeof mod.inArray).toBe("function");
    expect(typeof mod.sql).toBe("function");
  });

  it("re-exports the schema tables", async () => {
    const mod = await import("./index");
    expect(mod.products).toBeDefined();
    expect(mod.priceRecords).toBeDefined();
    expect(mod.runLogs).toBeDefined();
    expect(mod.settings).toBeDefined();
    expect(mod.manualReportSends).toBeDefined();
  });

  it("throws a clear error only when something actually touches the db proxy", async () => {
    const mod = await import("./index");
    // Touching a property triggers lazy init. Without DATABASE_URL it must
    // raise the documented message — silent failure here would let a misdeploy
    // through.
    expect(() => mod.db.select).toThrow(/DATABASE_URL/);
  });
});
