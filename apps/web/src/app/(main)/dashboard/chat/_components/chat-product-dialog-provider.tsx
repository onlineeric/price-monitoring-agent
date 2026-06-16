"use client";

import { type PropsWithChildren, useMemo } from "react";

import { ProductDetailDialog } from "@/app/(main)/dashboard/products/_components/product-detail-dialog";

import { ChatProductProvider } from "./chat-product-context";
import { useChatProductDialog } from "./use-chat-product-dialog";

/**
 * Wraps the chat thread, exposing `openProduct(id)` to product surfaces in
 * replies and rendering a single reused `ProductDetailDialog`. Mirrors the
 * GlobalProductSearchDialogProvider pattern, but opens the *detail* dialog —
 * including its "Check price now" / "Update product info" actions, which work
 * standalone (they depend only on the router + toast + fetch).
 */
export function ChatProductDialogProvider({ children }: PropsWithChildren) {
  const { product, open, openProduct, onOpenChange } = useChatProductDialog();

  const value = useMemo(() => ({ openProduct: (id: string) => void openProduct(id) }), [openProduct]);

  return (
    <ChatProductProvider value={value}>
      {children}
      {/* Mount the dialog only once a product has been opened. It calls router /
          toast hooks at the top level, so mounting it while idle would pull that
          machinery into every chat render for nothing. */}
      {product ? <ProductDetailDialog product={product} open={open} onOpenChange={onOpenChange} /> : null}
    </ChatProductProvider>
  );
}
