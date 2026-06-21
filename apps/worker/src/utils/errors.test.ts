import { describe, expect, it } from "vitest";

import { formatErrorMessage } from "./errors.js";

/**
 * formatErrorMessage is the shared "unknown thrown value -> log line" helper
 * used by both the DB service and the job utilities. It must stay total (never
 * throw) and predictable for the non-Error cases that bubble up from drivers.
 */

describe("formatErrorMessage", () => {
  it("returns the message of an Error instance", () => {
    expect(formatErrorMessage(new Error("connection refused"))).toBe("connection refused");
  });

  it("preserves the message of an Error subclass", () => {
    class DbError extends Error {}
    expect(formatErrorMessage(new DbError("deadlock detected"))).toBe("deadlock detected");
  });

  it("returns the fallback for non-Error values", () => {
    expect(formatErrorMessage("a string")).toBe("Unknown error");
    expect(formatErrorMessage({ code: 500 })).toBe("Unknown error");
    expect(formatErrorMessage(null)).toBe("Unknown error");
    expect(formatErrorMessage(undefined)).toBe("Unknown error");
  });
});
