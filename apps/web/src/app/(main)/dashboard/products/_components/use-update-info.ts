"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

/**
 * Triggers a full product-info refresh (metadata + price) for one product.
 *
 * The update-info route now WAITS for the worker to finish (BullMQ
 * `waitUntilFinished`), so this request stays pending — and the "Updating..."
 * state stays on — until the data is actually written. That lets us refresh
 * real data instead of the previous stale snapshot. The route reports one of
 * three outcomes via `status`:
 *   - "completed"  → data is written → toast + router.refresh()
 *   - "processing" → worker still running past the timeout → inform, no refresh
 *   - failure (response not ok) → error toast with the worker's message
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
        if (data.status === "processing") {
          // Synchronous wait timed out; the job is still running in the worker.
          toast.info("Still updating product info", {
            description: "It's taking longer than usual — refresh in a moment to see the result.",
          });
        } else {
          toast.success("Product info updated", {
            description: "Details and price have been refreshed.",
          });
          router.refresh();
        }
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
