import { describe, expect, it } from "vitest";

import { formatPrice } from "./format";

/**
 * formatPrice converts integer cents → human-readable currency string. The
 * web UI uses it everywhere a price appears, so getting the divide-by-100
 * wrong has wide blast radius.
 */

describe("formatPrice", () => {
  it("renders a typical price with the en-US grouping the dashboard expects", () => {
    expect(formatPrice(1999)).toBe("A$19.99");
  });

  it("treats the input as cents (always divides by 100)", () => {
    expect(formatPrice(0)).toBe("A$0.00");
    expect(formatPrice(100)).toBe("A$1.00");
    expect(formatPrice(99)).toBe("A$0.99");
  });

  it("respects an explicit currency override", () => {
    expect(formatPrice(1999, "USD")).toBe("$19.99");
    expect(formatPrice(1999, "EUR")).toBe("€19.99");
  });

  it("handles negative values (refund / promo) without dropping the sign", () => {
    expect(formatPrice(-500, "USD")).toContain("5.00");
    expect(formatPrice(-500, "USD").startsWith("-")).toBe(true);
  });
});
