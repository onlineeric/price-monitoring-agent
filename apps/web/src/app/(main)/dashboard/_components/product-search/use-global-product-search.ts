"use client";

import { useDeferredValue, useMemo, useState } from "react";

import {
  filterProductSearchResults,
  groupProductSearchResults,
  normalizeProductSearchResult,
  updateProductSearchResult,
  type ProductSearchApiRecord,
  type ProductSearchResult,
} from "./product-search-model";

type ProductsRequestState = "idle" | "loading" | "ready" | "error";
type ProductSelectionState = "idle" | "loading" | "error";

type ProductsResponse = {
  success: boolean;
  products?: ProductSearchApiRecord[];
  error?: string;
};

type ProductResponse = {
  success: boolean;
  product?: ProductSearchApiRecord;
  error?: string;
};

export function useGlobalProductSearch() {
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [productsRequestState, setProductsRequestState] = useState<ProductsRequestState>("idle");
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<ProductSelectionState>("idle");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredResults = useMemo(() => filterProductSearchResults(products, deferredQuery), [deferredQuery, products]);
  const groupedResults = useMemo(() => groupProductSearchResults(filteredResults), [filteredResults]);

  const loadProducts = async (force = false) => {
    if (!force && (productsRequestState === "loading" || productsRequestState === "ready")) {
      return;
    }

    setProductsRequestState("loading");
    setProductsError(null);

    try {
      const response = await fetch("/api/products");
      const result = (await response.json().catch(() => null)) as ProductsResponse | null;

      if (!response.ok || !result?.success || !result.products) {
        throw new Error(result?.error || "Failed to load products");
      }

      setProducts(result.products.map(normalizeProductSearchResult));
      setProductsRequestState("ready");
    } catch (error) {
      setProductsRequestState("error");
      setProductsError(error instanceof Error ? error.message : "Unknown error occurred");
    }
  };

  const selectProduct = async (productId: string) => {
    setSelectionState("loading");
    setSelectionError(null);

    try {
      const response = await fetch(`/api/products/${productId}`);
      const result = (await response.json().catch(() => null)) as ProductResponse | null;

      if (!response.ok || !result?.success || !result.product) {
        throw new Error(result?.error || "This product is no longer available");
      }

      const normalizedProduct = normalizeProductSearchResult(result.product);

      setProducts((currentProducts) => {
        const hasExistingProduct = currentProducts.some((product) => product.id === normalizedProduct.id);

        if (!hasExistingProduct) {
          return currentProducts;
        }

        return updateProductSearchResult(currentProducts, normalizedProduct);
      });
      setSelectionState("idle");

      return normalizedProduct;
    } catch (error) {
      setSelectionState("error");
      setSelectionError(error instanceof Error ? error.message : "Unknown error occurred");
      return null;
    }
  };

  const clearSelectionError = () => {
    setSelectionState("idle");
    setSelectionError(null);
  };

  const updateProduct = (updatedProduct: ProductSearchApiRecord) => {
    setProducts((currentProducts) => updateProductSearchResult(currentProducts, updatedProduct));
  };

  return {
    products,
    productsRequestState,
    productsError,
    groupedResults,
    hasResults: filteredResults.length > 0,
    query,
    selectionState,
    selectionError,
    clearSelectionError,
    loadProducts,
    selectProduct,
    setQuery,
    updateProduct,
  };
}
