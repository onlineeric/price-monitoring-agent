"use client";

import { useEffect, useState } from "react";

import { LayoutGrid, Table } from "lucide-react";

import { Button } from "@/components/ui/button";
// Canonical type now lives in the shared stats module (reused by the chat detail
// dialog in 009). Imported for local use and re-exported so existing
// `./products-view` import paths keep working.
import type { ProductWithStats } from "@/lib/products/product-stats";

import { ProductCardView } from "./product-card-view";
import { ProductTableView } from "./product-table-view";

export type { ProductWithStats };

type ViewMode = "card" | "table";

interface ProductsViewProps {
  products: ProductWithStats[];
}

export function ProductsView({ products }: ProductsViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("products-view-mode");
    if (saved === "card" || saved === "table") {
      setViewMode(saved);
    }
  }, []);

  // Save preference to localStorage
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("products-view-mode", mode);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* View Toggle */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={viewMode === "card" ? "default" : "outline"}
          size="sm"
          onClick={() => handleViewChange("card")}
          className="gap-2"
        >
          <LayoutGrid className="size-4" />
          Card View
        </Button>
        <Button
          variant={viewMode === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => handleViewChange("table")}
          className="gap-2"
        >
          <Table className="size-4" />
          Table View
        </Button>
      </div>

      {/* Render appropriate view */}
      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="mb-4 text-muted-foreground">
            No products yet. Add your first product to start monitoring prices.
          </p>
        </div>
      ) : viewMode === "card" ? (
        <ProductCardView products={products} />
      ) : (
        <ProductTableView products={products} />
      )}
    </div>
  );
}
