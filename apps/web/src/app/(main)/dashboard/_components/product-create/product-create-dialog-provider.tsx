"use client";

import { createContext, useContext, useRef, useState, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AddProductDialog } from "@/app/(main)/dashboard/products/_components/add-product-dialog";

export type ProductCreateDialogSource = "sidebar-quick-create" | "products-add-button";

type ProductCreateDialogContextValue = {
  openProductCreateDialog: (source: ProductCreateDialogSource, trigger?: HTMLElement | null) => void;
};

const ProductCreateDialogContext = createContext<ProductCreateDialogContextValue | null>(null);

export function ProductCreateDialogProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const originTriggerRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<ProductCreateDialogSource | null>(null);

  const restoreFocus = () => {
    const trigger = originTriggerRef.current;

    originTriggerRef.current = null;
    sourceRef.current = null;

    if (trigger?.isConnected) {
      requestAnimationFrame(() => {
        trigger.focus();
      });
    }
  };

  const closeProductCreateDialog = () => {
    setOpen(false);
    restoreFocus();
  };

  const openProductCreateDialog = (source: ProductCreateDialogSource, trigger?: HTMLElement | null) => {
    if (open) {
      return;
    }

    sourceRef.current = source;
    originTriggerRef.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      return;
    }

    closeProductCreateDialog();
  };

  const handleSuccess = () => {
    setOpen(false);

    if (pathname === "/dashboard/products") {
      router.refresh();
    }

    restoreFocus();
  };

  return (
    <ProductCreateDialogContext.Provider value={{ openProductCreateDialog }}>
      {children}
      <AddProductDialog open={open} onOpenChange={handleOpenChange} onSuccess={handleSuccess} />
    </ProductCreateDialogContext.Provider>
  );
}

export function useProductCreateDialog() {
  const context = useContext(ProductCreateDialogContext);

  if (!context) {
    throw new Error("Missing ProductCreateDialogProvider");
  }

  return context;
}
