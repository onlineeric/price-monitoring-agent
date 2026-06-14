import { describe, expect, it } from "vitest";

import {
  MAX_PRODUCT_ATTRIBUTES,
  productAttributesSchema,
  sanitizeProductAttributes,
} from "./attributes";

/**
 * The attributes contract is shared by the worker (write) and web (read), so
 * its validation rules are pinned here: non-empty pairs, a hard 100-item cap,
 * and a defensive sanitizer that never throws on extractor output.
 */

describe("productAttributesSchema", () => {
  it("accepts a well-formed key/value array", () => {
    const input = [
      { key: "Material", value: "Stainless steel" },
      { key: "Weight", value: "1.2kg" },
    ];
    expect(productAttributesSchema.parse(input)).toEqual(input);
  });

  it("rejects empty keys or values", () => {
    expect(productAttributesSchema.safeParse([{ key: "", value: "x" }]).success).toBe(false);
    expect(productAttributesSchema.safeParse([{ key: "x", value: "" }]).success).toBe(false);
  });

  it("rejects more than the 100-item cap", () => {
    const tooMany = Array.from({ length: MAX_PRODUCT_ATTRIBUTES + 1 }, (_, i) => ({
      key: `k${i}`,
      value: `v${i}`,
    }));
    expect(productAttributesSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("sanitizeProductAttributes", () => {
  it("returns [] for nullish or non-array input", () => {
    expect(sanitizeProductAttributes(null)).toEqual([]);
    expect(sanitizeProductAttributes(undefined)).toEqual([]);
    expect(sanitizeProductAttributes("nope")).toEqual([]);
  });

  it("drops entries with empty/blank key or value instead of throwing", () => {
    const result = sanitizeProductAttributes([
      { key: "Color", value: "Red" },
      { key: "", value: "ignored" },
      { key: "Size", value: "" },
      { key: "Brand", value: "Acme" },
    ]);
    expect(result).toEqual([
      { key: "Color", value: "Red" },
      { key: "Brand", value: "Acme" },
    ]);
  });

  it("truncates to the 100-item cap", () => {
    const tooMany = Array.from({ length: MAX_PRODUCT_ATTRIBUTES + 25 }, (_, i) => ({
      key: `k${i}`,
      value: `v${i}`,
    }));
    expect(sanitizeProductAttributes(tooMany)).toHaveLength(MAX_PRODUCT_ATTRIBUTES);
  });

  it("drops exact duplicate key/value pairs, keeping the first occurrence", () => {
    const result = sanitizeProductAttributes([
      { key: "Color", value: "Black" },
      { key: "Color", value: "Black" }, // exact dup → dropped
      { key: "Color", value: "White" }, // same key, different value → kept
      { key: "Size", value: "M" },
    ]);
    expect(result).toEqual([
      { key: "Color", value: "Black" },
      { key: "Color", value: "White" },
      { key: "Size", value: "M" },
    ]);
  });

  it("does not collide pairs that concatenate to the same string", () => {
    // {"a ","b"} and {"a"," b"} must stay distinct (NUL-separated dedupe key).
    const result = sanitizeProductAttributes([
      { key: "a ", value: "b" },
      { key: "a", value: " b" },
    ]);
    expect(result).toHaveLength(2);
  });
});
