import { describe, expect, it } from "vitest";

import { cn, formatCurrency, getInitials } from "./utils";

/**
 * utils.ts is imported by every Shadcn UI component. Keeping its tests
 * lightweight catches regressions in the className-merge behaviour that
 * would otherwise show up only as visual diffs.
 */

describe("cn", () => {
  it("merges class strings and dedupes Tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters out falsy entries", () => {
    expect(cn("text-sm", false, undefined, null, "font-bold")).toBe("text-sm font-bold");
  });

  it("expands arrays the same way clsx does", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });
});

describe("getInitials", () => {
  it("returns the placeholder for non-string / empty input", () => {
    // @ts-expect-error — intentional misuse to confirm runtime guard
    expect(getInitials(undefined)).toBe("?");
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });

  it("uppercases the first letter of each space-separated word", () => {
    expect(getInitials("Eric Cheng")).toBe("EC");
    expect(getInitials("price monitoring agent")).toBe("PMA");
  });

  it("collapses repeated whitespace", () => {
    expect(getInitials("Foo   Bar")).toBe("FB");
  });
});

describe("formatCurrency", () => {
  it("defaults to USD / en-US when no options are supplied", () => {
    expect(formatCurrency(19.99)).toBe("$19.99");
  });

  it("respects an explicit currency override", () => {
    expect(formatCurrency(19.99, { currency: "EUR" })).toBe("€19.99");
  });

  it("strips fractional digits when noDecimals=true (used in summary cards)", () => {
    expect(formatCurrency(1234.56, { noDecimals: true })).toBe("$1,235");
  });

  it("forwards explicit min/maxFractionDigits when noDecimals is unset", () => {
    expect(formatCurrency(1, { minimumFractionDigits: 4, maximumFractionDigits: 4 })).toBe("$1.0000");
  });

  it("falls back to a plain string when the currency is not valid ISO 4217", () => {
    // Regression: passing "$" to Intl.NumberFormat throws RangeError and crashes SSR.
    expect(formatCurrency(19.99, { currency: "$" })).toBe("$ 19.99");
    expect(formatCurrency(1234.56, { currency: "bogus", noDecimals: true })).toBe("bogus 1235");
  });
});
