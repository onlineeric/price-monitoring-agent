"use client";

import { createContext, startTransition, useContext, useRef, useState, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SharedEditProductDialog } from "@/app/(main)/dashboard/products/_components/edit-product/shared-edit-product-dialog";

import { useGlobalProductSearch } from "./use-global-product-search";
import type { ProductSearchResult } from "./product-search-model";

export type GlobalProductSearchDialogSource =
  | "header-search-button"
  | "header-search-shortcut"
  | "sidebar-search-button";

type SearchMode = "closed" | "search" | "edit";

type OpenGlobalProductSearchOptions = {
  source: GlobalProductSearchDialogSource;
  trigger?: HTMLElement | null;
};

type GlobalProductSearchDialogContextValue = {
  closeGlobalProductSearch: () => void;
  openGlobalProductSearch: (options: OpenGlobalProductSearchOptions) => void;
  open: boolean;
  productsError: string | null;
  productsRequestState: "idle" | "loading" | "ready" | "error";
  groupedResults: ReturnType<typeof useGlobalProductSearch>["groupedResults"];
  hasResults: boolean;
  query: string;
  selectionError: string | null;
  selectionState: "idle" | "loading" | "error";
  retryLoadProducts: () => void;
  selectProduct: (productId: string) => Promise<void>;
  setQuery: (nextQuery: string) => void;
};

const GlobalProductSearchDialogContext = createContext<GlobalProductSearchDialogContextValue | null>(null);

export function GlobalProductSearchDialogProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("closed");
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const originTriggerRef = useRef<HTMLElement | null>(null);
  const originPathnameRef = useRef(pathname);
  const {
    clearSelectionError,
    groupedResults,
    hasResults,
    loadProducts,
    productsError,
    productsRequestState,
    query,
    selectProduct: loadSelectedProduct,
    selectionError,
    selectionState,
    setQuery,
    updateProduct,
  } = useGlobalProductSearch();

  const restoreFocus = () => {
    const trigger = originTriggerRef.current;

    originTriggerRef.current = null;

    if (trigger?.isConnected) {
      requestAnimationFrame(() => {
        trigger.focus();
      });
    }
  };

  const closeFlow = () => {
    setMode("closed");
    setSelectedProduct(null);
    clearSelectionError();
    setQuery("");
    restoreFocus();
  };

  const openGlobalProductSearch = ({ source: _source, trigger }: OpenGlobalProductSearchOptions) => {
    if (mode !== "closed") {
      return;
    }

    originPathnameRef.current = pathname;
    originTriggerRef.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    clearSelectionError();
    setSelectedProduct(null);
    setQuery("");
    setMode("search");
    void loadProducts();
  };

  const retryLoadProducts = () => {
    void loadProducts(true);
  };

  const handleSelectProduct = async (productId: string) => {
    const product = await loadSelectedProduct(productId);

    if (!product) {
      setMode("search");
      return;
    }

    clearSelectionError();
    setSelectedProduct(product);
    setMode("edit");
  };

  const handleEditDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen || mode !== "edit") {
      return;
    }

    closeFlow();
  };

  const handleSaveSuccess = (updatedProduct: {
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
    updatedAt: string;
  }) => {
    updateProduct(updatedProduct);
    setMode("closed");
    setSelectedProduct(null);

    if (originPathnameRef.current === "/dashboard/products") {
      router.refresh();
    }

    restoreFocus();
  };

  const contextValue: GlobalProductSearchDialogContextValue = {
    closeGlobalProductSearch: closeFlow,
    openGlobalProductSearch,
    open: mode === "search",
    productsError,
    productsRequestState,
    groupedResults,
    hasResults,
    query,
    selectionError,
    selectionState,
    retryLoadProducts,
    selectProduct: async (productId: string) => {
      startTransition(() => {
        void handleSelectProduct(productId);
      });
    },
    setQuery: (nextQuery) => {
      startTransition(() => {
        setQuery(nextQuery);
      });
    },
  };

  return (
    <GlobalProductSearchDialogContext.Provider value={contextValue}>
      {children}
      {selectedProduct ? (
        <SharedEditProductDialog
          product={selectedProduct}
          open={mode === "edit"}
          onOpenChange={handleEditDialogOpenChange}
          onSaveSuccess={handleSaveSuccess}
        />
      ) : null}
    </GlobalProductSearchDialogContext.Provider>
  );
}

export function useGlobalProductSearchDialog() {
  const context = useContext(GlobalProductSearchDialogContext);

  if (!context) {
    throw new Error("Missing GlobalProductSearchDialogProvider");
  }

  return context;
}
