# Contract: `semantic_search_products` MCP tool

**Type**: MCP tool (registered in `apps/mcp-server/src/server.ts`, exposed to the chat agent over both transports). Coexists with the existing keyword `search_products`.

**Purpose**: Retrieve monitored products whose rich metadata is closest in *meaning* to a natural-language query (FR-001..FR-007).

## Input (Zod)

```ts
{
  query: string,            // natural-language description; required, non-empty
  limit?: number,           // optional top-N override (1..50); default SEMANTIC_SEARCH_TOP_N (5)
}
```

- `query` is the **semantic** part only. Price predicates ("cheap", "under $200") are NOT handled here — the agent routes those to the price tools (FR-006). The tool description states this so the model splits the query correctly.

## Behavior

1. Embed `query` with the local model (`embedQuery`).
2. Cosine-distance search across all `product_embeddings` rows.
3. Drop rows with `distance > SEMANTIC_SEARCH_MAX_DISTANCE` (relevance cutoff — FR-007).
4. Collapse to the **best (nearest) chunk per product** (FR-005).
5. Order by distance, take top-N distinct products (FR-004).
6. Join `products` for rich metadata and the latest `priceRecords` row → `currentPriceFormatted` (reuse the `search_products` latest-price pattern + `_format`).

## Output (success)

JSON text content — array of distinct products, nearest first:

```json
[
  {
    "id": "uuid",
    "name": "…",
    "url": "…",
    "brand": "…", "category": "…", "countryOfOrigin": "…",
    "description": "…",
    "attributes": [{ "key": "Refresh rate", "value": "165 Hz" }],
    "currentPriceFormatted": "NZD 585.00",   // latest price, reusing _format helper
    "matchedChunk": "…",                       // the best chunk's content (debug/explanation)
    "distance": 0.21                            // cosine distance (lower = closer)
  }
]
```

- **No relevant match / empty index** → empty array `[]` with a short human-readable note (e.g. `No products semantically match "<query>".`), never an error (FR-007).
- Errors flow through the shared `_wrap.ts` envelope → `{ error: { code, message } }` (consistent with all other tools).

## Non-functional

- Latency target: within ~2 s end-to-end on the prod-sized catalog (SC-009); model warm after first call.
- Tool args are not logged in full (consistent with existing MCP access-log policy); one access-log line per call (tool name, status, ms).
