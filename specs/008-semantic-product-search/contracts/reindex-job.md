# Contract: `reindex-product-embeddings` BullMQ job

**Type**: BullMQ job on the existing `price-monitor-queue`. Producer(s): the worker's `update-product-info` success path and the embeddings backfill. Consumer: the worker (`processJob` switch → `reindexEmbeddings.ts`).

**Purpose**: Durable, retryable bridge from "metadata changed" to "embeddings rebuilt", so a transient mcp-server outage self-heals without ever failing the metadata/price write (FR-015; clarify Q3).

## Payload

```ts
{ productId: string }   // the product whose embeddings to rebuild
```

## Job options (producer)

```ts
{
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 100,
}
```

## Handler behavior (`reindexEmbeddings.ts`)

1. `fetch(MCP_REINDEX_URL, { method: "POST", body: JSON.stringify({ productId }) })`.
2. Non-2xx response or network error → **throw** → BullMQ schedules a backoff retry.
3. `2xx` → resolve (log `productId` + chunk count).

The handler holds **no model** and does **no embedding** — it only calls the mcp-server endpoint (preserves the single-model-authority RAM budget).

## Producer rules

- **`update-product-info` success only.** Enqueued after `saveProductInfo` + `updateProductTimestamp` succeed. Wrapped in try/catch: an enqueue failure is logged but does **not** fail the job (FR-015). The info+price digest batch fans out to per-product `update-product-info`, so it is covered automatically (FR-010).
- **`check-price` never enqueues** (FR-011).
- **Backfill** enqueues one job per product (mirrors `backfill-product-info.ts`); idempotent because the handler/endpoint do delete-and-replace (FR-016/FR-017).

## Observability

- `[JOB ...]` lines from the existing worker listeners, plus a handler line: `reindex productId=<id> chunks=<n>` on success / the HTTP status on failure. Exhausted retries surface via BullMQ `failed` + `removeOnFail` retention for diagnosis (FR-015).
