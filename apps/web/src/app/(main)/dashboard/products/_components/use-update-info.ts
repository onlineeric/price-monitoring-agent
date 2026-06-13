"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

/**
 * Triggers a full product-info refresh (metadata + price) for one product.
 * Mirrors useCheckPrice — loading state, toast feedback, and router.refresh()
 * so the listing/detail picks up the new data — but hits the update-info route.
 */
export function useUpdateInfo() {
  const router = useRouter();
  const [updatingInfoId, setUpdatingInfoId] = useState<string | null>(null);

  const handleUpdateInfo = async (productId: string) => {
    setUpdatingInfoId(productId);
    try {
      const response = await fetch(`/api/products/${productId}/update-info`, {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("Product info update started", {
          description: "Details and price will be refreshed shortly.",
        });
        router.refresh();
      } else {
        toast.error("Failed to update product info", {
          description: data.error || "An unexpected error occurred",
        });
      }
    } catch {
      toast.error("Failed to update product info", {
        description: "Network error. Please try again.",
      });
    } finally {
      setUpdatingInfoId(null);
    }
  };

  return { handleUpdateInfo, updatingInfoId };
}
