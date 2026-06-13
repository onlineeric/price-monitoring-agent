# Contract: `POST /api/products/[id]/update-info`

New per-product route that triggers a full metadata + price refresh. Mirrors the
existing `POST /api/products/[id]/check-price` route exactly, differing only in
the job it enqueues. Unauthenticated, consistent with the rest of the app.

## Request

- Method: `POST`
- Path param: `id` — product UUID
- Body: none

## Behaviour

1. Validate `id` is a UUID → `400` `{ success: false, error: "Invalid product ID" }`.
2. Look up product by id → `404` `{ success: false, error: "Product not found" }`.
3. Enqueue `update-product-info` job with `{ url: product.url, triggeredAt }`.
4. Return `200`.

## Responses

| Status | Body |
|---|---|
| 200 | `{ success: true, jobId: string, message: "Product info update enqueued" }` |
| 400 | `{ success: false, error: "Invalid product ID" }` |
| 404 | `{ success: false, error: "Product not found" }` |
| 500 | `{ success: false, error: string }` |

## Notes

- Does **not** wait for extraction; the worker performs it asynchronously.
- The existing `check-price` route and its contract are unchanged (FR-005).
- Client hook `use-update-info.ts` mirrors `use-check-price.ts`
  (loading/disabled/toast + `router.refresh()`).
