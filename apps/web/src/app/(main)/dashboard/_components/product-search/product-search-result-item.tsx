"use client";

import Image from "next/image";

import { CheckCircle2, CircleOff, PackageSearch } from "lucide-react";

import { CommandItem } from "@/components/ui/command";

import type { ProductSearchResult } from "./product-search-model";

interface ProductSearchResultItemProps {
  product: ProductSearchResult;
  disabled?: boolean;
  onSelect: (productId: string) => void;
}

export function ProductSearchResultItem({ product, disabled = false, onSelect }: ProductSearchResultItemProps) {
  return (
    <CommandItem
      className="!py-2"
      disabled={disabled}
      keywords={[product.displayName, product.url, product.hostname]}
      onSelect={() => onSelect(product.id)}
      value={product.id}
    >
      {product.imageUrl ? (
        <div className="relative size-10 overflow-hidden rounded-md bg-muted">
          <Image src={product.imageUrl} alt={product.displayName} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <PackageSearch className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{product.displayName}</p>
        <p className="truncate text-muted-foreground text-xs">{product.hostname}</p>
        <p className="truncate text-muted-foreground text-xs">{product.url}</p>
      </div>
      <div className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
        {product.active ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleOff className="size-4" />}
        <span>{product.active ? "Active" : "Inactive"}</span>
      </div>
    </CommandItem>
  );
}
