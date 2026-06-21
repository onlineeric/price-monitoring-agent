import { describe, expect, it } from "vitest";

import {
  filterProductSearchResults,
  getProductSearchDisplayName,
  getProductSearchHostname,
  groupProductSearchResults,
  normalizeProductSearchResult,
  type ProductSearchApiRecord,
  updateProductSearchResult,
} from "@/app/(main)/dashboard/_components/product-search/product-search-model";

/**
 * product-search-model is the pure data layer behind the global product search
 * dialog: normalize -> group -> filter -> update. The UI component is tested
 * separately; these tests pin the normalization rules (display name fallback,
 * hostname parsing, lowercased search text) and the active/inactive split that
 * the dialog renders, so a refactor can't quietly change matching behaviour.
 */

function makeRecord(overrides: Partial<ProductSearchApiRecord> = {}): ProductSearchApiRecord {
  return {
    id: "p1",
    url: "https://shop.example.com/widget",
    name: "Widget",
    imageUrl: null,
    active: true,
    updatedAt: null,
    ...overrides,
  };
}

describe("getProductSearchDisplayName", () => {
  it("returns a trimmed name", () => {
    expect(getProductSearchDisplayName("  Widget  ")).toBe("Widget");
  });

  it("falls back when name is null, empty, or whitespace", () => {
    expect(getProductSearchDisplayName(null)).toBe("Untitled product");
    expect(getProductSearchDisplayName("")).toBe("Untitled product");
    expect(getProductSearchDisplayName("   ")).toBe("Untitled product");
  });
});

describe("getProductSearchHostname", () => {
  it("extracts the hostname from a valid URL", () => {
    expect(getProductSearchHostname("https://shop.example.com/widget?x=1")).toBe("shop.example.com");
  });

  it("returns the raw string for an unparseable URL", () => {
    expect(getProductSearchHostname("not a url")).toBe("not a url");
  });
});

describe("normalizeProductSearchResult", () => {
  it("derives displayName, hostname, lowercased searchText, and statusGroup", () => {
    const result = normalizeProductSearchResult(
      makeRecord({ name: "Cool Widget", url: "https://shop.example.com/w", active: true }),
    );
    expect(result.displayName).toBe("Cool Widget");
    expect(result.hostname).toBe("shop.example.com");
    expect(result.searchText).toBe("cool widget https://shop.example.com/w");
    expect(result.statusGroup).toBe("active");
  });

  it("maps inactive records to the inactive status group", () => {
    expect(normalizeProductSearchResult(makeRecord({ active: false })).statusGroup).toBe("inactive");
  });
});

describe("groupProductSearchResults", () => {
  it("splits results into active and inactive buckets preserving order", () => {
    const a1 = normalizeProductSearchResult(makeRecord({ id: "a1", active: true }));
    const i1 = normalizeProductSearchResult(makeRecord({ id: "i1", active: false }));
    const a2 = normalizeProductSearchResult(makeRecord({ id: "a2", active: true }));

    const grouped = groupProductSearchResults([a1, i1, a2]);

    expect(grouped.active.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(grouped.inactive.map((r) => r.id)).toEqual(["i1"]);
  });

  it("returns empty buckets for no results", () => {
    expect(groupProductSearchResults([])).toEqual({ active: [], inactive: [] });
  });
});

describe("filterProductSearchResults", () => {
  const results = [
    normalizeProductSearchResult(makeRecord({ id: "p1", name: "Red Shoes", url: "https://nike.com/red" })),
    normalizeProductSearchResult(makeRecord({ id: "p2", name: "Blue Hat", url: "https://adidas.com/blue" })),
  ];

  it("returns all results for an empty or whitespace query", () => {
    expect(filterProductSearchResults(results, "")).toHaveLength(2);
    expect(filterProductSearchResults(results, "   ")).toHaveLength(2);
  });

  it("matches case-insensitively on the display name", () => {
    expect(filterProductSearchResults(results, "RED").map((r) => r.id)).toEqual(["p1"]);
  });

  it("matches on the URL", () => {
    expect(filterProductSearchResults(results, "adidas").map((r) => r.id)).toEqual(["p2"]);
  });

  it("returns nothing when no result matches", () => {
    expect(filterProductSearchResults(results, "zzz")).toEqual([]);
  });
});

describe("updateProductSearchResult", () => {
  it("replaces the matching record with a freshly normalized one", () => {
    const initial = [
      normalizeProductSearchResult(makeRecord({ id: "p1", name: "Old", active: true })),
      normalizeProductSearchResult(makeRecord({ id: "p2", name: "Keep" })),
    ];

    const updated = updateProductSearchResult(initial, makeRecord({ id: "p1", name: "New", active: false }));

    const p1 = updated.find((r) => r.id === "p1");
    expect(p1?.displayName).toBe("New");
    expect(p1?.statusGroup).toBe("inactive");
    expect(updated.find((r) => r.id === "p2")?.displayName).toBe("Keep");
  });

  it("leaves the list unchanged when no id matches", () => {
    const initial = [normalizeProductSearchResult(makeRecord({ id: "p1", name: "Old" }))];
    const updated = updateProductSearchResult(initial, makeRecord({ id: "missing", name: "New" }));
    expect(updated.map((r) => r.displayName)).toEqual(["Old"]);
  });
});
