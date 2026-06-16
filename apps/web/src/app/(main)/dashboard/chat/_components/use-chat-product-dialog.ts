"use client";

import { useCallback, useState } from "react";

import { toast } from "sonner";

import type { ProductWithStats } from "@/lib/products/product-stats";

/**
 * Owns the "open a product detail dialog from chat" flow: fetch the product by
 * id, revive its JSON date fields back into `Date`s, and drive the dialog's
 * open state. A removed product (404) surfaces a friendly toast instead of an
 * empty dialog (FR-007). Hydration is on demand at click time — nothing polls
 * (project no-auto-refresh rule).
 */

interface ProductResponse {
  success?: boolean;
  product?: Record<string, unknown>;
  error?: string;
}

function reviveDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.length > 0) return new Date(value);
  return null;
}

/** JSON serializes `Date` → ISO string; the detail dialog expects real `Date`s. */
function reviveProduct(raw: Record<string, unknown>): ProductWithStats {
  const history = Array.isArray(raw.priceHistory) ? raw.priceHistory : [];
  return {
    ...(raw as unknown as ProductWithStats),
    lastSuccessAt: reviveDate(raw.lastSuccessAt),
    lastFailedAt: reviveDate(raw.lastFailedAt),
    createdAt: reviveDate(raw.createdAt),
    updatedAt: reviveDate(raw.updatedAt),
    lastChecked: reviveDate(raw.lastChecked),
    infoUpdatedAt: reviveDate(raw.infoUpdatedAt),
    priceHistory: history.map((point) => ({
      date: new Date((point as { date: string }).date),
      price: (point as { price: number }).price,
    })),
  };
}

export function useChatProductDialog() {
  const [product, setProduct] = useState<ProductWithStats | null>(null);
  const [open, setOpen] = useState(false);

  const openProduct = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/products/${id}`);
      const data = (await response.json().catch(() => null)) as ProductResponse | null;

      if (!response.ok || !data?.success || !data.product) {
        toast.error("Product no longer available", {
          description: "It may have been removed since the assistant found it.",
        });
        return;
      }

      setProduct(reviveProduct(data.product));
      setOpen(true);
    } catch {
      toast.error("Couldn't open product", {
        description: "Network error. Please try again.",
      });
    }
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return { product, open, openProduct, onOpenChange };
}
