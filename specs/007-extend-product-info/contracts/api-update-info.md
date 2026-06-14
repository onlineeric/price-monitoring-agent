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
4. **Wait** for the worker to finish (BullMQ `waitUntilFinished`, capped at
   `JOB_WAIT_TIMEOUT_MS` ≈ 45s) so the client can refresh real — not stale —
   data, then map the outcome to a status (see Responses). On timeout the job
   keeps running in the background and the route returns `202 processing`.

> Design note: this intentionally differs from `check-price` (fire-and-forget).
> A single user-triggered enrichment is slow (~3–6s render + AI) and the client
> wants to show the result, so the route waits and reports a precise outcome
> rather than enqueuing and returning immediately.

## Responses

| Status | `status` | Body |
|---|---|---|
| 200 | `completed` | `{ success: true, status: "completed", jobId: string }` — job resolved with `{ success: true }` |
| 202 | `processing` | `{ success: true, status: "processing", jobId, message }` — wait timed out; job still running |
| 400 | — | `{ success: false, error: "Invalid product ID" }` |
| 404 | — | `{ success: false, error: "Product not found" }` |
| 422 | `failed` | `{ success: false, status: "failed", error: string }` — job resolved with a clean failure, or rejected (no price / DB error) |
| 500 | — | `{ success: false, error: string }` — enqueue/handler threw |

## Notes

- The existing `check-price` route and its contract are unchanged (FR-005).
- Client hook `use-update-info.ts` keys off `status`: `completed` → toast +
  `router.refresh()`; `processing` → info toast (no refresh); non-OK → error toast.
