"use client";

import { toast } from "sonner";

import type { EditProductFormInput } from "./edit-product-form-schema";

type EditProductResult = {
  success: boolean;
  error?: string;
  product?: {
    id: string;
    url: string;
    name: string | null;
    imageUrl: string | null;
    active: boolean;
    updatedAt: string;
  };
};

export function useEditProduct() {
  const editProduct = async (productId: string, data: EditProductFormInput): Promise<EditProductResult> => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        product?: EditProductResult["product"];
      } | null;

      if (!response.ok || !result?.product) {
        throw new Error(result?.error || "Failed to update product");
      }

      toast.success("Product updated successfully!", {
        description: "Your changes have been saved.",
      });

      return {
        success: true,
        product: result.product,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";

      toast.error("Failed to update product", {
        description: message,
      });

      return {
        success: false,
        error: message,
      };
    }
  };

  return { editProduct };
}
