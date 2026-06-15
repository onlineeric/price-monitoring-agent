import type { ProductAttribute } from "@price-monitor/db";

/**
 * Composite document assembly (feature 008, US2).
 *
 * Turns a product's 007 rich metadata into a single text document, assembled in
 * priority order — name → brand → category → country of origin → description →
 * key/value specs (FR-008) — omitting absent fields. This document is the input
 * to chunking; it is never persisted as-is.
 *
 * A name-only product still yields a minimal, self-describing document (never
 * skipped), so it remains discoverable by semantic search.
 */

export interface EmbeddableProduct {
  name: string | null;
  brand: string | null;
  category: string | null;
  countryOfOrigin: string | null;
  description: string | null;
  attributes: ProductAttribute[] | null;
}

/** Trim + treat empty/whitespace as absent. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the short identity prefix prepended to every chunk so a chunk that
 * landed entirely in the spec list is still self-describing (research D4):
 * `"{name} — {brand} ({category})"`, omitting absent fields.
 */
export function buildIdentityPrefix(product: EmbeddableProduct): string {
  const name = clean(product.name);
  const brand = clean(product.brand);
  const category = clean(product.category);

  let prefix = name ?? "";
  if (brand) prefix = prefix ? `${prefix} — ${brand}` : brand;
  if (category) prefix = prefix ? `${prefix} (${category})` : `(${category})`;
  return prefix.trim();
}

/** Assemble the composite document in priority order, omitting absent fields. */
export function buildDocument(product: EmbeddableProduct): string {
  const sections: string[] = [];

  const name = clean(product.name);
  if (name) sections.push(name);

  const brand = clean(product.brand);
  if (brand) sections.push(`Brand: ${brand}`);

  const category = clean(product.category);
  if (category) sections.push(`Category: ${category}`);

  const country = clean(product.countryOfOrigin);
  if (country) sections.push(`Country of origin: ${country}`);

  const description = clean(product.description);
  if (description) sections.push(`Description: ${description}`);

  const specs = (product.attributes ?? [])
    .map((a) => ({ key: clean(a.key), value: clean(a.value) }))
    .filter((a): a is { key: string; value: string } => a.key !== null && a.value !== null)
    .map((a) => `- ${a.key}: ${a.value}`);
  if (specs.length > 0) {
    sections.push(`Specifications:\n${specs.join("\n")}`);
  }

  // Paragraph boundaries (\n\n) give the recursive splitter natural seams.
  return sections.join("\n\n");
}
