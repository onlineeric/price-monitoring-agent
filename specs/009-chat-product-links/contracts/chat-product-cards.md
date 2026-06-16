# Contract: tool-result → product surface extractor

Module: `apps/web/src/lib/chat/product-cards.ts` (pure, no I/O — easily unit tested).

## Input

An assistant message's `toolEvents: ToolCallEvent[]` (from the Zustand chat store).
Relevant events: `status === "completed"` and
`toolName ∈ { "search_products", "semantic_search_products" }`. Each such event's
`result` is the raw MCP `CallToolResult`:

```jsonc
{ "content": [ { "type": "text", "text": "<JSON array string>" } ] }
```

For a successful search the text is `JSON.stringify(results)` where each element is
at least `{ id, name, url, currentPriceFormatted, currentPriceCents, currency }`.
For "no match" the text is a plain sentence (NOT JSON).

## Output

```ts
interface MessageProductSurface {
  byId: Map<string, RetrievedProduct>; // all distinct retrieved products this message
  cards: RetrievedProduct[];           // first 5 in merged order
  overflowCount: number;               // max(0, distinct total - 5)
}
```

## Rules

1. Iterate `toolEvents` in order; skip non-completed, non-search, and error events.
2. For each, read `result.content[].text` (first text part), `JSON.parse`, then
   **Zod**-validate an array of products (`.passthrough()` for extra fields). Any
   parse/validation failure (incl. the "No products found." sentence, malformed
   JSON, unexpected shape) contributes nothing and is swallowed (no throw).
3. Merge all validated products across events; dedupe by `id` (first occurrence
   wins — Clarification 3, single merged deduplicated list).
4. `cards = merged.slice(0, 5)`; `overflowCount = merged.length - cards.length`
   (Clarification 1, cap 5 + "+N more matched").
5. If `merged.length === 0`, the caller renders **no** card surface (FR-008).

## Tests (required)

- Single search → cards mirror results, no overflow.
- Two searches with overlap → one deduped list; correct order; correct overflow.
- > 5 results → exactly 5 cards, `overflowCount` correct.
- "No products found." sentence → empty surface.
- `failed` event / non-search tool → ignored.
- Malformed/non-JSON text → empty surface, no throw.
