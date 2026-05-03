import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateEnv } from "./validateEnv";

/**
 * Worker startup calls validateAndExit, which crashes the process on any
 * missing required env. Pin the matrix here so we know exactly which keys
 * each provider requires before a deploy.
 */

const ALL_REQUIRED = ["DATABASE_URL", "REDIS_URL", "AI_PROVIDER", "RESEND_API_KEY"];
const PROVIDER_KEYS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

describe("validateEnv", () => {
  const originalEnv = { ...process.env };

  function freshEnv(extra: Record<string, string | undefined> = {}) {
    process.env = {} as NodeJS.ProcessEnv;
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) process.env[k] = v;
    }
  }

  beforeEach(() => {
    process.env = {} as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("flags every required variable as missing when env is empty", () => {
    const result = validateEnv();
    expect(result.valid).toBe(false);
    for (const key of ALL_REQUIRED) {
      expect(result.missing).toContain(key);
    }
  });

  it("returns valid=true when every required key (including provider key) is set", () => {
    freshEnv({
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      AI_PROVIDER: "anthropic",
      RESEND_API_KEY: "rsd",
      ANTHROPIC_API_KEY: "a",
    });
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it.each(Object.entries(PROVIDER_KEYS))(
    "requires %s-specific key when AI_PROVIDER=%s",
    (provider, key) => {
      freshEnv({
        DATABASE_URL: "postgres://x",
        REDIS_URL: "redis://x",
        AI_PROVIDER: provider,
        RESEND_API_KEY: "rsd",
      });
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing.some((m) => m.startsWith(key))).toBe(true);
    },
  );

  it("warns (not errors) on unrecognized AI_PROVIDER values — operator typo guard", () => {
    freshEnv({
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      AI_PROVIDER: "claude",
      RESEND_API_KEY: "rsd",
    });
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("Unknown AI_PROVIDER"))).toBe(true);
  });

  it("warns about missing scheduler env in production deployments", () => {
    freshEnv({
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      AI_PROVIDER: "anthropic",
      RESEND_API_KEY: "rsd",
      ANTHROPIC_API_KEY: "a",
      NODE_ENV: "production",
    });
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("ENABLE_SCHEDULER"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("SCHEDULER_TIMEZONE"))).toBe(true);
  });

  it("does NOT emit production-specific warnings outside production", () => {
    freshEnv({
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://x",
      AI_PROVIDER: "anthropic",
      RESEND_API_KEY: "rsd",
      ANTHROPIC_API_KEY: "a",
      NODE_ENV: "development",
    });
    const result = validateEnv();
    expect(result.warnings).toEqual([]);
  });
});
