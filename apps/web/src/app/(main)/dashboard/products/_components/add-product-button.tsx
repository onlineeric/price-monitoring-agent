"use client";

import { Plus } from "lucide-react";

import { useProductCreateDialog } from "@/app/(main)/dashboard/_components/product-create/product-create-dialog-provider";
import { Button } from "@/components/ui/button";

export function AddProductButton() {
  const { openProductCreateDialog } = useProductCreateDialog();

  return (
    <Button onClick={(event) => openProductCreateDialog("products-add-button", event.currentTarget)} size="lg" className="gap-2">
      <Plus className="size-4" />
      Add Product
    </Button>
  );
}
