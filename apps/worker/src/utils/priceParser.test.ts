import { describe, expect, it, vi } from "vitest";

import { CURRENCY_MAP, normalizeCurrency, parsePrice, resolveImageUrl } from "./priceParser";

/**
 * priceParser is hit by every successful Tier-1 (HTML) extraction and most
 * Tier-2 (Playwright) extractions. Its outputs land in the DB as the canonical
 * `price` (cents) and `currency` for each scrape, so the tests pin both the
 * format detection and the cents conversion.
 */

describe("parsePrice", () => {
  it("returns null on empty input rather than masking a missing-selector bug", () => {
    expect(parsePrice("")).toBeNull();
  });

  it("parses a US dollar amount into cents", () => {
    expect(parsePrice("$19.99")).toEqual({ price: 1999, currency: "USD" });
  });

  it("parses a European format with comma decimal", () => {
    expect(parsePrice("19,99 €")).toEqual({ price: 1999, currency: "EUR" });
  });

  it("treats the LAST separator as the decimal in mixed-format strings", () => {
    // US: 1,234.56 → $1234.56 → 123,456 cents
    expect(parsePrice("$1,234.56")).toEqual({ price: 123_456, currency: "USD" });
    // European: 1.234,56 → €1234.56 → 123,456 cents
    expect(parsePrice("1.234,56 €")).toEqual({ price: 123_456, currency: "EUR" });
  });

  it("recognizes currency symbols from the CURRENCY_MAP table", () => {
    expect(parsePrice("£10")?.currency).toBe("GBP");
    expect(parsePrice("¥500")?.currency).toBe("JPY");
    expect(parsePrice("₹100")?.currency).toBe("INR");
  });

  it("recognizes ISO currency codes when no symbol is present", () => {
    expect(parsePrice("EUR 19.99")?.currency).toBe("EUR");
    expect(parsePrice("19.99 usd")?.currency).toBe("USD"); // case-insensitive
  });

  it("defaults to USD when neither symbol nor code is detectable", () => {
    expect(parsePrice("19.99")?.currency).toBe("USD");
  });

  it("returns null when there are no digits to parse", () => {
    expect(parsePrice("free")).toBeNull();
  });

  it("uses banker-safe rounding (Math.round) so 0.999 → 100 cents", () => {
    // 0.999 * 100 = 99.9 → Math.round → 100
    expect(parsePrice("$0.999")?.price).toBe(100);
  });

  it("exports the documented currency map as a runtime value", () => {
    expect(CURRENCY_MAP.$).toBe("USD");
    expect(CURRENCY_MAP["€"]).toBe("EUR");
  });
});

describe("normalizeCurrency", () => {
  it("returns null for empty / null / whitespace input", () => {
    expect(normalizeCurrency(null)).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
    expect(normalizeCurrency("")).toBeNull();
    expect(normalizeCurrency("   ")).toBeNull();
  });

  it("uppercases 3-letter ISO-shaped input", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("NZD")).toBe("NZD");
    expect(normalizeCurrency(" eur ")).toBe("EUR");
  });

  it("maps known currency symbols to ISO codes (the reason this exists)", () => {
    expect(normalizeCurrency("$")).toBe("USD");
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(normalizeCurrency("£")).toBe("GBP");
    expect(normalizeCurrency("A$")).toBe("AUD");
  });

  it("returns null for anything we can't classify so callers fail loudly", () => {
    // Critical: we must not guess — saving an unknown string crashes Intl.NumberFormat downstream.
    expect(normalizeCurrency("dollars")).toBeNull();
    expect(normalizeCurrency("US$")).toBeNull();
    expect(normalizeCurrency("USDX")).toBeNull();
  });
});

describe("resolveImageUrl", () => {
  it("returns null when the input URL is empty / null", () => {
    expect(resolveImageUrl(null, "https://shop.example.com/p/1")).toBeNull();
    expect(resolveImageUrl("", "https://shop.example.com/p/1")).toBeNull();
  });

  it("passes absolute https URLs through unchanged", () => {
    expect(resolveImageUrl("https://cdn.example.com/x.jpg", "https://shop.example.com/")).toBe(
      "https://cdn.example.com/x.jpg",
    );
  });

  it("upgrades protocol-relative URLs to https (never http)", () => {
    expect(resolveImageUrl("//cdn.example.com/x.jpg", "https://shop.example.com/")).toBe(
      "https://cdn.example.com/x.jpg",
    );
  });

  it("resolves absolute paths against the base URL's origin", () => {
    expect(resolveImageUrl("/img/x.jpg", "https://shop.example.com/products/1")).toBe(
      "https://shop.example.com/img/x.jpg",
    );
  });

  it("resolves relative paths against the base URL", () => {
    expect(resolveImageUrl("../img/x.jpg", "https://shop.example.com/products/1")).toBe(
      "https://shop.example.com/img/x.jpg",
    );
  });

  it("blocks dangerous protocols (XSS vectors) regardless of casing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveImageUrl("javascript:alert(1)", "https://shop.example.com/")).toBeNull();
    expect(resolveImageUrl("DATA:text/html;base64,xxx", "https://shop.example.com/")).toBeNull();
    expect(resolveImageUrl("file:///etc/passwd", "https://shop.example.com/")).toBeNull();
    warn.mockRestore();
  });

  it("returns null when the base URL is not parseable as a URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveImageUrl("/x.jpg", "not a url")).toBeNull();
    warn.mockRestore();
  });
});
