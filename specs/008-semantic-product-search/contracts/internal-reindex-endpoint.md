# Contract: `POST /internal/reindex` (mcp-server internal HTTP endpoint)

**Type**: Plain HTTP route on the mcp-server's `node:http` server (`apps/mcp-server/src/transports/http.ts`), alongside `/health` and `/mcp`. **Not** an MCP tool — not exposed to the chat agent (research D1). HTTP transport mode only.

**Purpose**: The single write-time embedding entry point. Called by the worker's `reindex-product-embeddings` job and (indirectly, via the same job) by the backfill.

## Request

```
POST /internal/reindex
Content-Type: application/json

{ "productId": "uuid" }
```

- Body validated (Zod). Malformed/missing `productId` → `400` with `{ error: { code: "validation_error", message } }`.

## Behavior

Invokes `reindexProduct(productId)`:
1. Load the product + its 007 metadata via Drizzle. Missing product → `404` `{ error: { code: "not_found" } }`.
2. Build composite document → token-accurate chunks (with identity prefix).
3. Embed each chunk with the local model.
4. **Delete-and-replace**: delete the product's existing `product_embeddings` rows and insert the new set in one transaction (FR-012; atomic).

A product with only a name still yields ≥1 chunk (spec Edge Cases — near-empty metadata is indexed, not skipped).

## Response

- `200` → `{ "productId": "uuid", "chunks": <int> }` (number of rows written).
- `400` validation error · `404` unknown product · `500` `{ error: { code, message } }` on embed/DB failure.

## Why a non-2xx matters

The worker's job handler treats any non-2xx (or network failure) as a thrown error so **BullMQ retries with backoff** (contract: `reindex-job.md`). The endpoint is otherwise idempotent — a retried call simply re-runs delete-and-replace (FR-017).

## Security / ops

- Internal-only (same internal Docker network as `/mcp`); no auth, consistent with the app-wide deferral. Not reachable publicly (mcp-server has no public domain).
- Reuses the existing per-request logging; the response carries no product text beyond the chunk count.
