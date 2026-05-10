import { describe, expect, it } from "vitest";
import { formatPriceCents } from "./_format";

describe("formatPriceCents", () => {
  it("formats integer cents into a 2-decimal string with the currency code", () => {
    expect(formatPriceCents(58500, "USD")).toBe("USD 585.00");
    expect(formatPriceCents(199900, "NZD")).toBe("NZD 1999.00");
  });

  it("preserves cents correctly for small and zero values", () => {
    expect(formatPriceCents(0, "USD")).toBe("USD 0.00");
    expect(formatPriceCents(99, "USD")).toBe("USD 0.99");
    expect(formatPriceCents(100, "USD")).toBe("USD 1.00");
  });

  it("returns null when cents is null or undefined (mirrors empty price-history rows)", () => {
    expect(formatPriceCents(null, "USD")).toBeNull();
    expect(formatPriceCents(undefined, "USD")).toBeNull();
  });

  it("falls back to UNKNOWN when currency is missing so the model still sees an explicit code", () => {
    expect(formatPriceCents(1000, null)).toBe("UNKNOWN 10.00");
    expect(formatPriceCents(1000, undefined)).toBe("UNKNOWN 10.00");
    expect(formatPriceCents(1000, "")).toBe("UNKNOWN 10.00");
    expect(formatPriceCents(1000, "   ")).toBe("UNKNOWN 10.00");
  });

  it("normalizes currency code casing and trims whitespace", () => {
    expect(formatPriceCents(1000, "usd")).toBe("USD 10.00");
    expect(formatPriceCents(1000, " nzd ")).toBe("NZD 10.00");
  });
});
