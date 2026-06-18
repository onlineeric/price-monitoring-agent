# Phase 1 Data Model: Extend Product Info Extraction

## Entities

### Product (extended)

Existing `products` columns are unchanged. The feature adds the following
**optional, nullable, additive** columns. No existing column is dropped, renamed,
or cleared. Existing rows receive `NULL` for every new column until enriched.

| Column (DB) | Drizzle field | Type | Null? | Default | Notes |
|---|---|---|---|---|---|
| `description` | `description` | `text` | yes | `NULL` | Full text, **no length limit** (UI clamps for display). FR-001 |
| `category` | `category` | `text` | yes | `NULL` | FR-001 |
| `brand` | `brand` | `text` | yes | `NULL` | Brand / manufacturer. FR-001 |
| `country_of_origin` | `countryOfOrigin` | `text` | yes | `NULL` | FR-001 |
| `attributes` | `attributes` | `jsonb` `$type<ProductAttribute[]>()` | yes | `NULL` | Ordered key/value specs, **≤100**. FR-001 |
| `info_updated_at` | `infoUpdatedAt` | `timestamp` | yes | `NULL` | When metadata was last extracted, distinct from price check. FR-002 |

Unchanged existing columns: `id`, `url` (unique identity), `name`, `image_url`,
`active`, `last_success_at`, `last_failed_at`, `created_at`, `updated_at`.

> `last_success_at` / `last_failed_at` keep their meaning (any successful/failed
> scrape). `info_updated_at` is set **only** by a successful `update-product-info`
> run, never by `check-price`. This is what lets the detail dialog show both
> "info last updated" and "price last checked" (FR-012).

#### `ProductAttribute` (shared type)

Defined in `packages/db/src/attributes.ts`, re-exported from `@price-monitor/db`:

```ts
export interface ProductAttribute {
  key: string;   // e.g. "Material"
  value: string; // e.g. "Stainless steel"
}

export const MAX_PRODUCT_ATTRIBUTES = 100;

export const productAttributeSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

// Validates and enforces the cap; extra entries beyond 100 are dropped.
export const productAttributesSchema = z
  .array(productAttributeSchema)
  .max(MAX_PRODUCT_ATTRIBUTES);
```

Drizzle column: `jsonb("attributes").$type<ProductAttribute[]>()`.

**Validation rules**
- `attributes` length MUST be ≤ `MAX_PRODUCT_ATTRIBUTES` (100). The AI prompt
  requests at most the 100 most relevant; persistence defensively truncates if
  the model returns more (FR-003, edge case "unusually large spec list").
- Each attribute requires non-empty `key` and `value`; empty pairs are dropped.
- All metadata fields are optional; absence is represented as `NULL` (text
  fields) or `NULL`/`[]` (attributes).

### Price record (unchanged)

`price_records` is **not** modified. Both `check-price` and `update-product-info`
append exactly one row (price in integer cents + currency). No schema change.

### Product info refresh (operation/concept, not a table)

A request to extract full metadata + price for one product, realised as the
`update-product-info` BullMQ job. In the batch case the digest flow fans out one
child job per active product. No persisted entity of its own; its effects are the
new price record + overwritten metadata + `info_updated_at` on the product.

## State transitions (metadata lifecycle)

```
NULL/empty (new or pre-feature row)
   │  on add  ─────────────►  update-product-info enqueued
   │  user "Update info"  ──►  update-product-info enqueued
   │  batch "info+price"  ──►  update-product-info enqueued (per product)
   ▼
update-product-info run
   ├─ page processed OK  ──►  metadata OVERWRITTEN (found fields stored,
   │                          missing fields blanked), price appended,
   │                          info_updated_at = now, last_success_at = now
   └─ total failure      ──►  metadata UNCHANGED, info_updated_at UNCHANGED,
                              last_failed_at = now, run log FAILED

check-price run (any time)
   └─ price appended, last_success_at = now;
      metadata + info_updated_at UNTOUCHED   (FR-005, concurrency edge case)
```

"Page processed but no metadata found" is a **success** under overwrite
semantics: fields are blanked, a price is still recorded, `info_updated_at` is
still set (the attempt happened) — see spec edge cases.

## Migration artifacts (`packages/db/drizzle/`)

Versioned, committed, journalled (FR-021/022/023, SC-007):

- `0000_<name>.sql` — **baseline** of the current schema, every DDL statement
  guarded with `IF NOT EXISTS` so it is a no-op on already-populated databases
  (local dev created via `push`, and production) and a full create on fresh ones.
- `0001_<name>.sql` — additive:
  ```sql
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" text;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" text;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" text;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "country_of_origin" text;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "attributes" jsonb;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "info_updated_at" timestamp;
  ```
- `meta/_journal.json` + snapshot files — generated by drizzle-kit; committed so
  future diffs are computed from the recorded baseline, not the live DB.

Applied by `packages/db/src/migrate.ts` (Drizzle `postgres-js` migrator pointed
at `./drizzle`), invoked by `pnpm --filter @price-monitor/db migrate` (manual)
and by the gated worker on startup (`RUN_MIGRATIONS=true`).

## Type / contract impact

- `@price-monitor/db`: `Product` / `NewProduct` inferred types automatically gain
  the new fields; `ProductAttribute`, `productAttributesSchema`,
  `MAX_PRODUCT_ATTRIBUTES` are newly exported.
- `apps/web` `ProductWithStats` extends with the six new fields so the detail
  dialog and dashboard widgets can render metadata without extra fetches.
- Worker extraction result type gains the optional metadata fields (see
  `contracts/extraction-output.md`).
