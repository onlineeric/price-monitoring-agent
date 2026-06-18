# Contract: `GET /api/products/[id]` (additive enrichment)

**Status**: change to an existing route. **Backward-compatible** (additive superset).

## Before

Returns the bare product row:

```jsonc
{ "success": true, "product": { /* raw products row */ } }
```

## After

Returns the full `ProductWithStats` superset as `product` (all previous fields
remain, with computed stats added):

```jsonc
{
  "success": true,
  "product": {
    // ...all existing raw products-row fields (id, url, name, imageUrl, active,
    //    description, category, brand, countryOfOrigin, attributes,
    //    infoUpdatedAt, createdAt, updatedAt, lastSuccessAt, lastFailedAt, ...)
    "currentPrice": 58500,            // integer cents | null
    "currency": "NZD",               // default "USD" when no price yet
    "lastChecked": "2026-06-15T...",  // ISO string | null
    "priceHistory": [                 // last 30 days, ascending
      { "date": "2026-05-20T...", "price": 60000 }
    ]
  }
}
```

- **404** unchanged: `{ "success": false, "error": "Product not found" }`.
- **500** unchanged.

## Compatibility

- Implemented by calling the shared `getProductWithStats(id)` helper.
- Sole existing consumer is `useGlobalProductSearch.selectProduct`, which passes
  the response through `normalizeProductSearchResult` (reads only
  `id`/`name`/`url`/`active`/`updatedAt`). Extra fields are ignored → no break.

## Consumer responsibility (chat hydration)

Dates arrive as ISO strings over JSON. The chat hydration hook MUST revive
`lastChecked`, `priceHistory[].date`, `infoUpdatedAt`, `createdAt`, `updatedAt`,
`lastSuccessAt`, `lastFailedAt` into `Date` objects before passing the object to
`ProductDetailDialog` (which expects `Date`).

## Tests

- Returns enriched shape for an existing product (stats + raw fields present).
- 404 path unchanged for a missing id.
- Backward-compat assertion: the fields `normalizeProductSearchResult` relies on
  are still present and correctly typed.
