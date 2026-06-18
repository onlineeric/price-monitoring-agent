# Phase 1 Data Model: Clickable Products in Chat Replies

This feature introduces **no database tables or columns** and **no queue
payloads**. The "data model" here is the set of client/runtime shapes that move
between the chat tool results, the extractor, and the reused detail dialog. All
persistence is read-only reuse of existing `products` / `priceRecords` tables.

## Entity 1 — `ProductWithStats` (existing; promoted to shared)

The canonical shape the detail dialog consumes. Currently declared in
`products-view.tsx`; this feature **moves it** to
`apps/web/src/lib/products/product-stats.ts` and re-exports it from
`products-view.tsx` (no behavior change at existing import sites).

| Field | Type | Source |
|---|---|---|
| `id` | `string` | products.id |
| `url` | `string` | products.url |
| `name` | `string` | products.name (coalesced to "Unnamed Product") |
| `imageUrl` | `string \| null` | products.imageUrl |
| `active` | `boolean` | products.active (default true) |
| `lastSuccessAt` / `lastFailedAt` | `Date \| null` | products.* |
| `createdAt` / `updatedAt` | `Date \| null` | products.* |
| `currentPrice` | `number \| null` | latest priceRecords.price (integer cents) |
| `currency` | `string` | latest priceRecords.currency (default "USD") |
| `lastChecked` | `Date \| null` | latest priceRecords.scrapedAt |
| `priceHistory` | `Array<{ date: Date; price: number }>` | priceRecords (last 30 days, ascending) |
| `description` / `category` / `brand` / `countryOfOrigin` | `string \| null` | products.* (007 metadata) |
| `attributes` | `ProductAttribute[] \| null` | products.attributes (007) |
| `infoUpdatedAt` | `Date \| null` | products.infoUpdatedAt (007) |

**Validation / invariants**: prices are integer cents (never divided); dates are
real `Date` objects when handed to the dialog. The by-id API serializes dates to
ISO strings — the chat hydration hook **revives** them before constructing this
shape.

## Entity 2 — `RetrievedProduct` (new; from tool results)

The minimal product identity the assistant surfaced in a reply. Produced by the
extractor by Zod-validating each product tool's result array. It is the unit the
card list renders and the inline-link resolver matches against.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | dedup key; matched by `product:<id>` links |
| `name` | `string \| null` | display (coalesce on render) |
| `url` | `string` | source URL (display/secondary) |
| `currentPriceFormatted` | `string \| null` | e.g. `"NZD 585.00"` — shown verbatim |
| `currentPriceCents` | `number \| null` | raw cents (not shown; available if needed) |
| `currency` | `string \| null` | currency code |

Zod schema (conceptual): `z.array(z.object({ id: z.string(), name: z.string().nullable(),
url: z.string(), currentPriceFormatted: z.string().nullable().optional(),
currentPriceCents: z.number().nullable().optional(), currency: z.string().nullable().optional() }))`
with `.passthrough()` tolerance for the extra metadata fields semantic search adds.

## Entity 3 — `MessageProductSurface` (new; extractor output)

The per-assistant-message result of parsing `toolEvents`, consumed by both UI
surfaces.

| Field | Type | Meaning |
|---|---|---|
| `byId` | `Map<string, RetrievedProduct>` | every distinct retrieved product this message (powers inline-link resolution: `byId.has(id)`) |
| `cards` | `RetrievedProduct[]` | first 5 in merged order (powers the card list) |
| `overflowCount` | `number` | `max(0, total distinct − 5)` → "+N more matched" |

**Derivation rules** (Clarifications 1 & 3):
1. Consider only `status === "completed"` events whose `toolName` is
   `search_products` or `semantic_search_products`.
2. For each, read `result.content[].text`, `JSON.parse`, Zod-validate; on any
   failure (including the "No products found" sentence) contribute nothing.
3. Merge across events in event order; dedupe by `id` (first wins).
4. `cards = merged.slice(0, 5)`; `overflowCount = merged.length - cards.length`.
5. Empty merge → no card surface rendered at all (FR-008).

## Entity 4 — `ChatProductContext` (new; React context value)

Threaded from the chat-scoped provider down to messages and the Markdown renderer.

| Field | Type | Meaning |
|---|---|---|
| `openProduct` | `(id: string) => void` | fetch by id → hydrate → open `ProductDetailDialog`; 404 → "no longer available" toast |

The per-message retrieved-set (`byId`) is computed at the message level (not in
context) so each assistant bubble resolves its own inline links against the
products **it** retrieved.

## Lifecycle / state

- **Card list**: appears only after the underlying tool event reaches `completed`
  (streaming text alone never yields cards — FR edge "Streaming in progress").
- **Open product**: transient client state in the provider; one product open at a
  time; closing returns to the conversation unchanged (FR-003).
- **No persistence**: nothing here is stored; re-opening re-fetches fresh stats
  (FR-006), consistent with no-auto-refresh.
