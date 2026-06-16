"use client";

import { ChevronRight, Package } from "lucide-react";

import type { MessageProductSurface } from "@/lib/chat/product-cards";
import { cn } from "@/lib/utils";

import { useChatProduct } from "./chat-product-context";

/**
 * The clickable product list shown under an assistant reply that retrieved
 * products (US1). Built from the message's tool results — up to 5 cards plus a
 * "+N more matched" note. Each card opens the shared product detail dialog.
 */
export function ChatProductCards({ surface }: { surface: MessageProductSurface }) {
  const { openProduct } = useChatProduct();

  if (surface.cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5" data-testid="chat-product-cards">
      {surface.cards.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => openProduct(product.id)}
          aria-label={`Open details for ${product.name ?? "product"}`}
          data-testid="chat-product-card"
          className={cn(
            "group flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2",
            "text-left transition-colors hover:bg-foreground/5",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium text-sm">{product.name ?? "Unnamed product"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground text-sm tabular-nums">{product.currentPriceFormatted ?? "—"}</span>
            <ChevronRight
              className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>
      ))}

      {surface.overflowCount > 0 ? (
        <p className="px-1 text-muted-foreground text-xs" data-testid="chat-product-overflow">
          +{surface.overflowCount} more matched
        </p>
      ) : null}
    </div>
  );
}
