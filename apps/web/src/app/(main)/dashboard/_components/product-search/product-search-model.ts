"use client";

export type ProductSearchApiRecord = {
  id: string;
  url: string;
  name: string | null;
  imageUrl: string | null;
  active: boolean;
  updatedAt: string | null;
};

export type ProductSearchResult = ProductSearchApiRecord & {
  displayName: string;
  hostname: string;
  searchText: string;
  statusGroup: "active" | "inactive";
};

export type GroupedProductSearchResults = {
  active: ProductSearchResult[];
  inactive: ProductSearchResult[];
};

export function getProductSearchDisplayName(name: string | null) {
  return name?.trim() || "Untitled product";
}

export function getProductSearchHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function normalizeProductSearchResult(product: ProductSearchApiRecord): ProductSearchResult {
  const displayName = getProductSearchDisplayName(product.name);
  const hostname = getProductSearchHostname(product.url);
  const searchText = `${displayName} ${product.url}`.toLowerCase();

  return {
    ...product,
    displayName,
    hostname,
    searchText,
    statusGroup: product.active ? "active" : "inactive",
  };
}

export function groupProductSearchResults(results: ProductSearchResult[]): GroupedProductSearchResults {
  const grouped: GroupedProductSearchResults = {
    active: [],
    inactive: [],
  };

  for (const result of results) {
    if (result.statusGroup === "active") {
      grouped.active.push(result);
      continue;
    }

    grouped.inactive.push(result);
  }

  return grouped;
}

export function filterProductSearchResults(results: ProductSearchResult[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return results;
  }

  return results.filter((result) => result.searchText.includes(normalizedQuery));
}

export function updateProductSearchResult(
  results: ProductSearchResult[],
  updatedProduct: ProductSearchApiRecord,
): ProductSearchResult[] {
  const normalizedProduct = normalizeProductSearchResult(updatedProduct);

  return results.map((result) => (result.id === normalizedProduct.id ? normalizedProduct : result));
}
