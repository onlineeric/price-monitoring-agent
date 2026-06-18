# Contract: Extended extraction output

The price-only extraction output is **unchanged** (FR-004). A new richer output
is produced only by the metadata path (`aiExtractProductInfo` /
`scrapeProductInfo`).

## Existing (unchanged) — `ScraperResult.data`

```ts
{
  title: string | null;
  price: number | null;     // integer cents
  currency: string | null;  // ISO 4217
  imageUrl: string | null;
}
```

`scrapeProduct` (Tier 1 → Tier 2) and `check-price` continue to use exactly this.

## New — product info extraction

`aiExtractProductInfo(url, html)` extends the existing Zod `ProductDataSchema`
with optional metadata. All new fields are nullable/optional — the extractor
returns only what it finds (FR-003).

```ts
const ProductInfoSchema = z.object({
  // existing price fields (unchanged semantics)
  title: z.string().nullable(),
  price: z.number().nullable(),          // decimal; converted to cents on output
  currency: z.string().nullable(),
  imageUrl: z.string().nullable(),
  // new metadata fields
  description: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .max(100)
    .nullable(),                          // top-100 most relevant
});
```

Output type (worker-side result `data`):

```ts
{
  title: string | null;
  price: number | null;        // integer cents (× 100, rounded — as today)
  currency: string | null;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  countryOfOrigin: string | null;
  attributes: ProductAttribute[] | null;  // validated + capped at 100
}
```

## Prompt requirements

- Extend the existing extraction prompt to also request description, category,
  brand/manufacturer, country of origin, and key/value spec attributes.
- Instruct: return **at most the 100 most important/relevant** attributes; omit
  anything not present rather than inventing values.
- Price selection rules (main/current/discounted price) are unchanged.

## Success / validation

- Success still requires at least a usable **price** (metadata alone does not
  make a successful price-bearing run; a run with no price is a total failure for
  the `update-product-info` job — see `job-update-product-info.md`).
- `attributes` is re-validated with `productAttributesSchema` and truncated to
  100 before persistence, regardless of what the model returns.
