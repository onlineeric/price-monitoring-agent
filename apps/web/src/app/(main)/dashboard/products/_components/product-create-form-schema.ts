import * as z from "zod";

export const productCreateFormSchema = z.object({
  url: z.string().min(1, "URL is required").url("Must be a valid URL"),
  name: z.string().optional(),
});

export type ProductCreateFormInput = z.infer<typeof productCreateFormSchema>;

export const productCreateFormDefaultValues: ProductCreateFormInput = {
  url: "",
  name: "",
};

export function normalizeProductCreateName(name: string | null | undefined) {
  const trimmedName = name?.trim();

  return trimmedName ? trimmedName : null;
}
