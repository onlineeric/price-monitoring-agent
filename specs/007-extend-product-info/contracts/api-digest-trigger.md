# Contract: `POST /api/digest/trigger` (extended with refresh mode)

The digest trigger gains an optional refresh **mode** that selects how each
active product is refreshed before the email is sent. Backward compatible: a
missing/invalid mode defaults to `"price"` (existing behaviour).

## Request

- Method: `POST`
- Body (JSON, optional):

```json
{ "mode": "price" | "info" }
```

| `mode` | Meaning | Child jobs in the digest flow |
|---|---|---|
| `"price"` (default) | Existing price-only digest | `check-price` |
| `"info"` | Full metadata + price for every product | `update-product-info` |

## Behaviour

1. Parse body; coerce anything other than `"info"` to `"price"` (default-safe).
2. Enqueue `send-digest` job with `{ triggeredBy: "manual", triggeredAt, mode }`.
3. Return `200 { success: true, jobId, message: "Digest email process started" }`.

## Downstream propagation

- `sendDigestJob` reads `mode` from `job.data` and passes it to
  `enqueueRefreshFlowForActiveProducts(triggerType, mode)`.
- `enqueueRefreshFlowForActiveProducts` builds child jobs named `check-price`
  (mode `price`) or `update-product-info` (mode `info`), keeping the
  `send-digest-flow` parent and `ignoreDependencyOnFailure: true` unchanged.
- Scheduled digests (`send-digest-scheduled`) have no UI mode selector and
  default to `"price"` — the routine scheduled digest stays price-only and cheap
  (SC-002).

## Responses

| Status | Body |
|---|---|
| 200 | `{ success: true, jobId: string, message: string }` |
| 500 | `{ error: "Failed to trigger digest" }` |

## UI (`manual-trigger-button.tsx`)

- Remove the disabled "Force AI Extraction" `Switch` and the
  "(Feature under construction)" caption (FR-016).
- Replace with a two-option control (RadioGroup) defaulting to
  **"Refresh all products' price"**; second option **"Refresh all products info
  (info + price)"** (FR-017).
- Selected option maps to `mode` in the POST body (FR-018). An info+price run
  should communicate it is the more expensive option.
