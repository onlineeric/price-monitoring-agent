"use client";
import * as React from "react";

import { AlertCircle, LoaderCircle, Search } from "lucide-react";

import { ProductSearchResultItem } from "@/app/(main)/dashboard/_components/product-search/product-search-result-item";
import { useGlobalProductSearchDialog } from "@/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export function SearchDialog() {
  const {
    groupedResults,
    hasResults,
    open,
    openGlobalProductSearch,
    productsError,
    productsRequestState,
    query,
    retryLoadProducts,
    selectionError,
    selectionState,
    selectProduct,
    setQuery,
    closeGlobalProductSearch,
  } = useGlobalProductSearchDialog();

  const handleShortcut = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "j" || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    openGlobalProductSearch({
      source: "header-search-shortcut",
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  });

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => handleShortcut(event);

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <Button
        variant="link"
        className="!px-0 font-normal text-muted-foreground hover:no-underline"
        onClick={(event) =>
          openGlobalProductSearch({
            source: "header-search-button",
            trigger: event.currentTarget,
          })
        }
      >
        <Search className="size-4" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeGlobalProductSearch()}>
        <CommandInput placeholder="Search products by name or URL…" value={query} onValueChange={setQuery} />
        <CommandList>
          {productsRequestState === "loading" ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-muted-foreground text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              <span>Loading products…</span>
            </div>
          ) : null}

          {productsRequestState === "error" ? (
            <div className="space-y-3 px-4 py-6 text-center">
              <div className="flex items-center justify-center gap-2 text-sm">
                <AlertCircle className="size-4 text-destructive" />
                <span>{productsError || "Could not load products."}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={retryLoadProducts}>
                Retry
              </Button>
            </div>
          ) : null}

          {selectionError ? <div className="px-4 pt-4 text-destructive text-sm">{selectionError}</div> : null}

          {productsRequestState === "ready" && hasResults ? (
            <>
              {groupedResults.active.length > 0 ? (
                <CommandGroup heading="Active products">
                  {groupedResults.active.map((product) => (
                    <ProductSearchResultItem
                      key={product.id}
                      product={product}
                      disabled={selectionState === "loading"}
                      onSelect={(productId) => {
                        void selectProduct(productId);
                      }}
                    />
                  ))}
                </CommandGroup>
              ) : null}
              {groupedResults.inactive.length > 0 ? (
                <>
                  {groupedResults.active.length > 0 ? <CommandSeparator /> : null}
                  <CommandGroup heading="Inactive products">
                    {groupedResults.inactive.map((product) => (
                      <ProductSearchResultItem
                        key={product.id}
                        product={product}
                        disabled={selectionState === "loading"}
                        onSelect={(productId) => {
                          void selectProduct(productId);
                        }}
                      />
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </>
          ) : null}

          {productsRequestState === "ready" && !hasResults ? (
            <CommandEmpty>{query.trim() ? "No matching products found." : "No products available yet."}</CommandEmpty>
          ) : null}

          {selectionState === "loading" ? (
            <CommandItem disabled className="!py-2">
              <LoaderCircle className="size-4 animate-spin" />
              <span>Opening product editor…</span>
            </CommandItem>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
