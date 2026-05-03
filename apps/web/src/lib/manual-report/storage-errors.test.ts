import { describe, expect, it } from "vitest";

import { isManualReportLedgerMissingError } from "./storage-errors";

/**
 * isManualReportLedgerMissingError discriminates "you forgot to run db:push"
 * from real DB outages so the API can return a friendly setup hint instead
 * of a generic 500. The detector walks the postgres error chain (.cause).
 */

describe("isManualReportLedgerMissingError", () => {
  it("returns false for a generic Error", () => {
    expect(isManualReportLedgerMissingError(new Error("connection refused"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isManualReportLedgerMissingError(null)).toBe(false);
    expect(isManualReportLedgerMissingError(undefined)).toBe(false);
    expect(isManualReportLedgerMissingError("oops")).toBe(false);
  });

  it("detects postgres '42P01 relation does not exist' on the manual_report_sends table", () => {
    const err = {
      code: "42P01",
      message: 'relation "manual_report_sends" does not exist',
      query: 'select "completed_at" from "manual_report_sends"',
    };
    expect(isManualReportLedgerMissingError(err)).toBe(true);
  });

  it("traverses .cause to find the real underlying postgres error", () => {
    const inner = {
      code: "42P01",
      message: 'relation "manual_report_sends" does not exist',
      query: "select * from manual_report_sends",
    };
    const wrapped = { name: "DrizzleError", message: "Failed query", cause: inner };
    expect(isManualReportLedgerMissingError(wrapped)).toBe(true);
  });

  it("does NOT match a 42P01 against an unrelated table", () => {
    const err = {
      code: "42P01",
      message: 'relation "products" does not exist',
      query: "select * from products",
    };
    expect(isManualReportLedgerMissingError(err)).toBe(false);
  });

  it("matches when the message mentions the ledger table even without code", () => {
    // Drizzle wrapping sometimes reformats the error envelope without code,
    // so we accept message+query mentioning the ledger table as a fallback.
    const err = {
      message: "Failed query: select * from manual_report_sends",
      query: 'select "completed_at" from "manual_report_sends"',
    };
    expect(isManualReportLedgerMissingError(err)).toBe(true);
  });
});
