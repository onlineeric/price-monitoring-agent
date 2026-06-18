# Contract: `update-product-info` BullMQ job

New job type on the existing `price-monitor-queue`, registered in
`apps/worker/src/queue/worker.ts` alongside `check-price` / `send-digest*`.

## Job data

```ts
interface UpdateProductInfoJobData {
  url?: string;        // preferred (URL-first), as with check-price
  productId?: string;  // legacy fallback (looked up to a URL)
  triggeredAt?: Date;
}
```

Enqueued by:
- `POST /api/products/[id]/update-info` (per-product action)
- `POST /api/products` (on add — replaces the previous `check-price` enqueue)
- digest flow children when `mode === "info"`
- `scripts/backfill-product-info.ts`

## Processing (FR-006, FR-008 — overwrite, best-effort)

1. Resolve target URL (URL-first, productId fallback) — reuse the existing
   resolution helper pattern from `priceCheck.ts`.
2. `scrapeProductInfo(url)` → Playwright render + AI extraction returning price
   fields **and** metadata (see `extraction-output.md`).
3. **Total failure** (page unreachable / extraction error / no price):
   - `updateProductFailure(productId)`, `logRun(FAILED)`.
   - Metadata fields and `info_updated_at` left **unchanged**. No partial writes.
4. **Success** (page processed, price present):
   - `getOrCreateProductByUrl(url, title, imageUrl)` (unchanged behaviour).
   - `savePriceRecord({ productId, price, currency })` — append one price row.
   - `saveProductInfo(productId, { description, category, brand,
     countryOfOrigin, attributes })` — **overwrite** all metadata: store found
     fields, write `NULL`/empty for fields not found this run (blanking previous
     values), set `info_updated_at = now`. `attributes` is validated + capped at
     100 via `productAttributesSchema` before persisting.
   - `updateProductTimestamp` / `logRun(SUCCESS)` as today.
   - "Processed but nothing found" is still success: metadata blanked, price
     recorded, `info_updated_at` set.

## Result

Reuses the scraper-style result union; on success returns the extraction result,
on skip returns `{ status: "skipped", reason }` (mirrors `priceCheck.ts`).

## Invariants

- A `check-price` run on the same product never clears metadata or sets
  `info_updated_at` (concurrency edge case).
- The expensive AI tier is used **only** by this job, never by `check-price`
  (SC-002).
