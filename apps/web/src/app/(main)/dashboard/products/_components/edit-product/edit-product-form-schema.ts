"use client";

import * as z from "zod";

export const editProductFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  active: z.boolean(),
});

export type EditProductFormInput = z.infer<typeof editProductFormSchema>;

export const getEditProductFormDefaultValues = (product: {
  name: string | null;
  active: boolean;
}): EditProductFormInput => ({
  name: product.name ?? "",
  active: product.active,
});
