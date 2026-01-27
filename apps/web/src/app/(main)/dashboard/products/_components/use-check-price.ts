"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

export function useCheckPrice() {
  const router = useRouter();
  const [checkingPriceId, setCheckingPriceId] = useState<string | null>(null);

  const handleCheckPrice = async (productId: string) => {
    setCheckingPriceId(productId);
    try {
      const response = await fetch(`/api/products/${productId}/check-price`, {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast.success("Price check started", {
          description: "The price will be updated shortly.",
        });
        router.refresh();
      } else {
        toast.error("Failed to check price", {
          description: data.error || "An unexpected error occurred",
        });
      }
    } catch {
      toast.error("Failed to check price", {
        description: "Network error. Please try again.",
      });
    } finally {
      setCheckingPriceId(null);
    }
  };

  return { handleCheckPrice, checkingPriceId };
}
