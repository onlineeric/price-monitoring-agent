import { describe, expect, it } from "vitest";

import { parseAndValidateRecipientInput, parseRecipientList, validateRecipientList } from "./recipient-list";

/**
 * The recipient list is the only user-controlled write path that goes
 * straight to Resend. Pin: max-3 cap, dedupe, lowercase normalization,
 * and per-address email validation.
 */

describe("parseRecipientList", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseRecipientList("a@x.com, b@y.com ,c@z.com")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });

  it("normalizes to lowercase", () => {
    expect(parseRecipientList("Alice@Example.com")).toEqual(["alice@example.com"]);
  });

  it("filters out empty entries (trailing commas)", () => {
    expect(parseRecipientList("a@x.com,,b@y.com,")).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("validateRecipientList", () => {
  it("requires at least one recipient", () => {
    const result = validateRecipientList([]);
    expect(result.errors.some((e) => e.includes("At least one"))).toBe(true);
  });

  it("caps the list at 3 (matches the UI / Resend limit)", () => {
    const result = validateRecipientList(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(result.errors.some((e) => e.includes("at most 3"))).toBe(true);
  });

  it("flags duplicate addresses (case-normalized callers should never trigger this)", () => {
    const result = validateRecipientList(["a@x.com", "a@x.com"]);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("flags invalid emails individually so the user can see which one is wrong", () => {
    const result = validateRecipientList(["a@x.com", "not-an-email"]);
    expect(result.errors.some((e) => e.includes("not-an-email"))).toBe(true);
  });

  it("returns the deduped list back so callers can use the cleaned set", () => {
    const result = validateRecipientList(["a@x.com", "a@x.com"]);
    expect(result.recipients).toEqual(["a@x.com"]);
  });
});

describe("parseAndValidateRecipientInput", () => {
  it("composes parse + validate into one call (the route handler shape)", () => {
    const result = parseAndValidateRecipientInput("Alice@Example.com,bob@x.com");
    expect(result.recipients).toEqual(["alice@example.com", "bob@x.com"]);
    expect(result.errors).toEqual([]);
  });
});
