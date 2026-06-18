import { describe, expect, it } from "vitest";
import { buildDocument, buildIdentityPrefix, type EmbeddableProduct } from "./document";

/**
 * buildDocument assembles a product's 007 metadata into one text document in a
 * fixed priority order, omitting absent fields, and always yields something for
 * a name-only product. buildIdentityPrefix builds the per-chunk identity line.
 */

const FULL: EmbeddableProduct = {
  name: "UltraView 27",
  brand: "Acme",
  category: "Monitors",
  countryOfOrigin: "Taiwan",
  description: "A colour-accurate 27-inch display.",
  attributes: [
    { key: "Refresh rate", value: "165 Hz" },
    { key: "Panel", value: "IPS" },
  ],
};

describe("buildDocument", () => {
  it("assembles fields in priority order: name → brand → category → country → description → specs", () => {
    const doc = buildDocument(FULL);
    const idx = (s: string) => doc.indexOf(s);
    expect(idx("UltraView 27")).toBeGreaterThanOrEqual(0);
    expect(idx("UltraView 27")).toBeLessThan(idx("Brand: Acme"));
    expect(idx("Brand: Acme")).toBeLessThan(idx("Category: Monitors"));
    expect(idx("Category: Monitors")).toBeLessThan(idx("Country of origin: Taiwan"));
    expect(idx("Country of origin: Taiwan")).toBeLessThan(idx("Description: A colour-accurate"));
    expect(idx("Description: A colour-accurate")).toBeLessThan(idx("Specifications:"));
    expect(doc).toContain("- Refresh rate: 165 Hz");
    expect(doc).toContain("- Panel: IPS");
  });

  it("omits absent fields (no empty labels)", () => {
    const doc = buildDocument({
      name: "Mystery Item",
      brand: null,
      category: "Misc",
      countryOfOrigin: null,
      description: null,
      attributes: [],
    });
    expect(doc).toContain("Mystery Item");
    expect(doc).toContain("Category: Misc");
    expect(doc).not.toContain("Brand:");
    expect(doc).not.toContain("Country of origin:");
    expect(doc).not.toContain("Description:");
    expect(doc).not.toContain("Specifications:");
  });

  it("drops half-empty spec pairs (key or value blank)", () => {
    const doc = buildDocument({
      ...FULL,
      attributes: [
        { key: "Refresh rate", value: "165 Hz" },
        { key: "", value: "orphan" },
        { key: "Ports", value: "" },
      ],
    });
    expect(doc).toContain("- Refresh rate: 165 Hz");
    expect(doc).not.toContain("orphan");
    expect(doc).not.toContain("- Ports:");
  });

  it("yields a minimal, non-empty document for a name-only product (never skipped)", () => {
    const doc = buildDocument({
      name: "Lonely Product",
      brand: null,
      category: null,
      countryOfOrigin: null,
      description: null,
      attributes: null,
    });
    expect(doc).toBe("Lonely Product");
    expect(doc.length).toBeGreaterThan(0);
  });
});

describe("buildIdentityPrefix", () => {
  it("formats name — brand (category) when all present", () => {
    expect(buildIdentityPrefix(FULL)).toBe("UltraView 27 — Acme (Monitors)");
  });

  it("omits absent brand/category", () => {
    expect(buildIdentityPrefix({ ...FULL, brand: null })).toBe("UltraView 27 (Monitors)");
    expect(buildIdentityPrefix({ ...FULL, category: null })).toBe("UltraView 27 — Acme");
    expect(buildIdentityPrefix({ ...FULL, brand: null, category: null })).toBe("UltraView 27");
  });

  it("falls back gracefully when name is missing", () => {
    expect(buildIdentityPrefix({ ...FULL, name: null })).toBe("Acme (Monitors)");
  });
});
