# Phase 0 Research: Clickable Products in Chat Replies

All Technical Context items were resolvable from the existing codebase — no
NEEDS CLARIFICATION remained after the spec's clarification session. This file
records the load-bearing decisions and the code evidence behind them.

## Decision 1 — Hydrate the detail dialog from a shared stats helper

- **Decision**: Extract the products page's private `getProductsWithStats()` into
  `apps/web/src/lib/products/product-stats.ts` exposing `getAllProductsWithStats()`
  (used by `products/page.tsx`) and `getProductWithStats(id)` (used by the by-id
  route). Move the `ProductWithStats` type there and re-export it from
  `products-view.tsx`.
- **Rationale**: `ProductDetailDialog` consumes a `ProductWithStats` and does **no
  fetching of its own** (`product-detail-dialog.tsx` reads everything off the prop).
  The only thing missing for chat is a way to produce that shape for one product.
  Duplicating the query would violate DRY (explicit user directive) and constitution
  II. The list version stays identical behavior; the single version is the same
  per-product mapper applied once.
- **Evidence**: `products/page.tsx:8-50` builds the shape with two Drizzle selects
  per product (latest price + 30-day history); `products-view.tsx:14-39` declares
  `ProductWithStats`; `product-detail-dialog.tsx:56-60` takes the prop and renders.
- **Alternatives considered**:
  - *Compute stats inside the dialog on open* — rejected: pushes DB/fetch concerns
    into a presentational component and forks the shape source.
  - *Have chat call the products list endpoint and filter* — rejected: over-fetches
    the whole catalog to open one product.

## Decision 2 — Enrich `GET /api/products/[id]` additively

- **Decision**: Return the full `ProductWithStats` as `product` (a superset of the
  raw row) instead of the bare row.
- **Rationale**: The detail dialog needs `currentPrice`, `currency`, `lastChecked`,
  and `priceHistory`, which the current route omits (`[id]/route.ts:9-18` returns
  the raw select). Returning a superset is backward-compatible: the only existing
  consumer, `useGlobalProductSearch.selectProduct`, passes the response through
  `normalizeProductSearchResult`, which reads just `name`/`url`/`active`/`id`/
  `updatedAt` — extra fields are ignored.
- **Evidence**: `use-global-product-search.ts:65-90` fetches `/api/products/${id}`
  and normalizes; `product-search-model.ts:36-46` shows the narrow field reads.
- **Serialization note**: JSON turns `Date` → ISO string. The chat hydration hook
  revives `lastChecked`, `priceHistory[].date`, `infoUpdatedAt`, `createdAt`,
  `updatedAt`, `lastSuccessAt`, `lastFailedAt` into `Date` before constructing the
  `ProductWithStats` the dialog expects (the products page passes real `Date`s
  because it is a server component).
- **Alternatives considered**:
  - *New endpoint `/api/products/[id]/stats`* — rejected: a second by-id route for
    the same resource; the additive change is simpler and backward-safe.

## Decision 3 — Parse tool results with Zod; one extractor for both surfaces

- **Decision**: A single module reads an assistant message's `toolEvents`, and for
  each **completed** `search_products` / `semantic_search_products` event parses the
  stored MCP `CallToolResult` → `content[].text` → `JSON.parse` → Zod-validated
  array of products. It returns the deduped retrieved-product map (all ids) and the
  capped 5-card view + overflow count.
- **Rationale**: The AI SDK bridge stores each tool's **raw** result untruncated in
  `event.result` (`chat-tools.ts:164-166`; `chat-stream.ts:94-119` assigns `output`
  → `event.result`). Both product tools emit the **same** core fields, so one Zod
  schema covers both (`search-products.ts:54-66` and `semantic-search-products.ts:52-56`
  → `{ id, name, url, currentPriceCents, currency, currentPriceFormatted, … }`).
  Parsing structured data with Zod (not regex) satisfies constitution II and the
  global rule. Cards and inline-link resolution share the parse → DRY.
- **Evidence**: success output shape is `{ content: [{ type: "text", text: "<JSON>" }] }`;
  "no match" is a plain sentence (`search-products.ts:42`,
  `semantic-search-products.ts:46-49`) → fails JSON/Zod → yields no products (correct).
  Error envelopes are already flagged `failed` upstream (`chat-stream.ts:99-114`) so
  the extractor only looks at `completed` events.
- **Dedup & cap**: merge across all of the message's product-tool events in event
  order, dedupe by `id` (first occurrence wins), then slice to 5 and report
  `Math.max(0, total - 5)` as "+N more matched" (Clarification 1 & 3).
- **Alternatives considered**:
  - *Render straight from model prose only* — rejected: unreliable, model-trusted ids.
  - *Two separate parsers for cards vs links* — rejected: duplication.

## Decision 4 — `#product-<id>` Markdown links, resolved against retrieved ids

- **Decision**: Prompt the model to render a referenced product as
  `[Name](#product-<id>)`. In `markdown-content.tsx`, supply a custom `<a>` renderer
  to Streamdown. If `<id>` is in this message's retrieved-product set, render an
  actionable button (`openProduct(id)`); otherwise render the link text as plain text.
- **Implementation correction**: a custom `product:` URL **protocol** does not
  survive Streamdown — rehype-sanitize strips non-allow-listed protocols (href →
  `undefined` → a `[blocked]` span). A URL **fragment** (`#product-<id>`) is kept by
  rehype-sanitize and passed through by rehype-harden, so the fragment is the scheme
  actually shipped. (Verified against the failing test before the switch.)
- **Rationale**: This makes the inline surface **provably safe** (FR-005): a link can
  only act if it points at a product the assistant actually retrieved this turn, so a
  hallucinated/stale id degrades to ordinary text rather than opening the wrong
  product. Reuses the existing sanitization seam rather than adding a parallel one.
- **Evidence**: `markdown-content.tsx:70-79` already centralizes URL policy via
  `safeUrlTransform`; Streamdown accepts a `components` override for `a`. `javascript:`
  and non-image `data:` remain blocked.
- **Alternatives considered**:
  - *Open on any `product:` link regardless of id, then 404 on click* — rejected:
    weaker fail-safe; lets prose open arbitrary/garbage ids.
  - *Custom non-URL token (e.g. `@@product:id@@`)* — rejected: fights the Markdown
    pipeline; links are the natural, sanitizable unit.

## Decision 5 — Reuse the detail dialog and its actions unchanged

- **Decision**: Open the existing `ProductDetailDialog` from chat, including its
  "Check price now" / "Update product info" footer actions. A chat-scoped provider
  owns the open product + the by-id fetch and renders one dialog instance.
- **Rationale**: `useCheckPrice` and `useUpdateInfo` depend only on `useRouter`,
  `toast`, and `fetch` — **no products-page context** — so they already work from
  chat (FR-002 is essentially free). This matches the existing
  `GlobalProductSearchDialogProvider` shape (a provider that fetches by id and owns a
  dialog), so we follow an established pattern rather than inventing one.
- **Evidence**: `use-check-price.ts:9-41` and `use-update-info.ts:21-60` (self-
  contained); `global-product-search-dialog-provider.tsx:42-181` (provider + fetch +
  dialog pattern to mirror, but it opens the *edit* dialog).
- **Operational note**: `router.refresh()` from these actions re-renders the chat
  route's server tree (small); the Zustand chat state is client-side and preserved
  (FR-003). The open dialog won't live-update after an action — consistent with the
  project's no-auto-refresh rule.
- **Alternatives considered**:
  - *Read-only detail variant for chat* — rejected by Clarification 2 (reuse fully).
  - *Lift the global provider to also open detail* — rejected: it is tied to the edit
    flow; a small dedicated chat provider is clearer and lower-risk.

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Where does the detail dialog's data come from? | A `ProductWithStats` prop; chat produces it via the new shared helper + by-id route. |
| Is the by-id route safe to change? | Yes — additive superset; sole consumer reads a narrow subset. |
| What exact shape is `event.result`? | Raw MCP `CallToolResult` (`{ content: [{type:"text", text:JSON}] }`), passed untruncated by the bridge. |
| Do both search tools share fields? | Yes — `{ id, name, url, currentPriceCents, currency, currentPriceFormatted }`. |
| Do the dialog's action buttons need the products page? | No — the hooks use only `useRouter`/`toast`/`fetch`. |
| New env / migration / queue work? | None. |
