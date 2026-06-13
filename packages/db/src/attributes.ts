import { z } from "zod";

/**
 * A single product spec attribute — an ordered key/value pair such as
 * `{ key: "Material", value: "Stainless steel" }`.
 *
 * Stored as an ordered JSONB array on `products.attributes` so the extractor's
 * "most important first" ordering is preserved and near-duplicate keys are
 * tolerated (a plain object map would silently collapse them).
 */
export interface ProductAttribute {
  key: string;
  value: string;
}

/**
 * Hard cap on how many attributes we persist per product. The AI prompt asks
 * for at most the 100 most relevant; persistence truncates defensively so a
 * misbehaving model can never bloat a row.
 */
export const MAX_PRODUCT_ATTRIBUTES = 100;

/** A single attribute: both key and value must be non-empty. */
export const productAttributeSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

/**
 * The full attributes array as persisted. Validates each pair and enforces the
 * 100-item cap. Use {@link sanitizeProductAttributes} when you want to drop
 * invalid/empty pairs and truncate instead of throwing.
 */
export const productAttributesSchema = z.array(productAttributeSchema).max(MAX_PRODUCT_ATTRIBUTES);

/**
 * Defensively coerce arbitrary attribute input into a clean, capped array:
 * drop entries with an empty/blank key or value, then keep only the first
 * {@link MAX_PRODUCT_ATTRIBUTES}. Never throws — returns `[]` for nullish input.
 *
 * This is the safe path for persistence (the AI extractor may return more than
 * 100 or include empty pairs); `productAttributesSchema` remains for strict
 * validation where throwing on a violation is desired.
 */
export function sanitizeProductAttributes(input: unknown): ProductAttribute[] {
  if (!Array.isArray(input)) return [];
  const cleaned: ProductAttribute[] = [];
  for (const entry of input) {
    const parsed = productAttributeSchema.safeParse(entry);
    if (parsed.success) {
      cleaned.push(parsed.data);
      if (cleaned.length === MAX_PRODUCT_ATTRIBUTES) break;
    }
  }
  return cleaned;
}
