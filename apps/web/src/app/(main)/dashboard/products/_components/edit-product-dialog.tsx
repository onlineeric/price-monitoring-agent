"use client";

import { useRouter } from "next/navigation";

import { SharedEditProductDialog } from "./edit-product/shared-edit-product-dialog";
import type { ProductWithStats } from "./products-view";

interface EditProductDialogProps {
  product: ProductWithStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProductDialog({ product, open, onOpenChange }: EditProductDialogProps) {
  const router = useRouter();

  return (
    <SharedEditProductDialog
      product={product}
      open={open}
      onOpenChange={onOpenChange}
      onSaveSuccess={() => {
        onOpenChange(false);
        router.refresh();
      }}
    />
  );
}
