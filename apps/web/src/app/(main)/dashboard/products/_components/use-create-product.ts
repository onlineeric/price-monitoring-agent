"use client";

import { toast } from "sonner";

import { normalizeProductCreateName, type ProductCreateFormInput } from "./product-create-form-schema";

type CreateProductResult = {
  success: boolean;
  error?: string;
};

export function useCreateProduct() {
  const createProduct = async (data: ProductCreateFormInput): Promise<CreateProductResult> => {
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: data.url,
          name: normalizeProductCreateName(data.name),
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error || "Failed to add product");
      }

      toast.success("Product added successfully!", {
        description: "The product has been added to your monitoring list.",
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";

      toast.error("Failed to add product", {
        description: message,
      });

      return {
        success: false,
        error: message,
      };
    }
  };

  return { createProduct };
}
