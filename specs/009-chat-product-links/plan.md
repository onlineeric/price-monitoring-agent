# Implementation Plan: Clickable Products in Chat Replies

**Branch**: `009-chat-product-links` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-chat-product-links/spec.md`

## Summary

When the chat assistant retrieves products (via `search_products` or
`semantic_search_products`), the reply currently renders as pure text — every
product name is a dead end. This feature makes those products openable directly
from the conversation, via **two surfaces**:

1. **Structured product cards** (P1, reliable) built from the tool results the
   assistant actually got — one merged, deduplicated list per reply, capped at 5
   with a "+N more matched" affordance.
2. **Inline `product:<id>` links** (P2, convenience) the model emits in its prose,
   resolved against the same retrieved-product set so an unresolvable mention
   fails safe to plain text.

Both surfaces open the **existing reusable `ProductDetailDialog`** — including its
"Check price now" / "Update product info" actions — without leaving the chat page.

The technical spine is **reuse, not duplication** (the explicit user directive):

- Extract the products page's `getProductsWithStats` query into a shared helper so
  a single product can be hydrated into the exact `ProductWithStats` shape the
  detail dialog already consumes — no new detail UI, no second stats query.
- Reuse `ProductDetailDialog`, `useCheckPrice`, and `useUpdateInfo` as-is; they
  already depend only on `useRouter` + `toast` + `fetch`, so they work from chat
  with zero coupling to the products page.
- A single tool-result extractor feeds **both** the card list and the inline-link
  resolver (one parse, two consumers).

Scope is entirely within `apps/web` plus one chat-only system-prompt edit. No
schema migration, no worker change, no MCP server change, no new env vars.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16 (App Router), React 19

**Primary Dependencies**: Vercel AI SDK v6 (chat stream), `streamdown` (Markdown
render), Drizzle ORM, Zod (tool-result validation), `sonner` (toasts), Shadcn UI
Dialog, `date-fns`

**Storage**: PostgreSQL via Drizzle query builder — **read-only** for this feature
(`products`, `priceRecords`). No schema change. Existing write actions
("Check price now" / "Update product info") are reused through their existing API
routes (which already enqueue BullMQ jobs).

**Testing**: Vitest, colocated `*.test.ts(x)`; web jsdom setup in
`apps/web/src/test/setup.ts`; chainable-Drizzle mock pattern for DB-touching units;
`apps/web/src/test/` tree for route/page tests.

**Target Platform**: Web (dashboard chat page), same Coolify-deployed `web` app.

**Project Type**: Web application (monorepo `apps/web` only for this feature).

**Performance Goals**: Click → detail dialog hydrated from a single product's
stats in well under typical interaction latency (2 small indexed queries — latest
price + 30-day history for one product id). Card extraction is a synchronous,
in-memory parse of already-received tool output (no extra network).

**Constraints**: On-demand hydration only — no polling/auto-refresh of chat data
(project rule). Inline links must fail safe (FR-005). Markdown stays sanitized
(no new XSS surface from the `product:` scheme). Card list bounded at 5 (FR-009).

**Scale/Scope**: Single chat page; ≤5 cards per reply; product catalog is small
(personal monitoring). N+1 hydration is acceptable for one product.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Monorepo Architecture Fidelity** | PASS. All changes live in `apps/web` (existing boundary): a shared `lib/products` helper, an additive API enrichment, chat components, and `lib/ai` prompt text. No new app/package/runtime. |
| **II. Typed, Explicit, Maintainable Code** | PASS. Tool results parsed with **Zod**, not regex (constitution + global rule). One extractor reused by two surfaces (DRY). `ProductWithStats` becomes a single shared type instead of being redeclared. |
| **III. Safe Data Access & Canonical Models** | PASS. Drizzle query builder only (reuses the existing `db.select()` pattern from `products/page.tsx`); no `db.execute()`. Prices stay integer cents and are surfaced via the existing `currentPriceFormatted` string. By-id route change is **additive/backward-compatible**. |
| **IV. Independent, Risk-Proportional Verification** | PASS. Each user story is independently testable (cards without inline links; inline links layered on). Pure extractor + render branches get unit tests; the additive route gets a route test. Verification strategy in §Testing below. |
| **V. Operational Resilience by Default** | PASS. No env/scheduler/queue/migration changes. Reused write actions already enqueue jobs and surface toasts. `router.refresh()` fired from chat re-renders only the chat route's (minimal) server tree; client chat state is Zustand and is preserved. Failure modes (deleted product → "no longer available"; malformed tool output → no cards) are explicit. |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/009-chat-product-links/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — client/data shapes (no DB tables)
├── quickstart.md        # Phase 1 — manual + automated validation guide
├── contracts/
│   ├── products-by-id.md      # Additive GET /api/products/[id] enrichment
│   ├── chat-product-cards.md  # Tool-result → card list extraction contract
│   └── product-link-scheme.md # `product:<id>` Markdown link + system-prompt contract
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
apps/web/src/
├── lib/
│   ├── products/
│   │   ├── product-stats.ts          # NEW — shared getProductWithStats / getAllProductsWithStats + ProductWithStats type (extracted from products/page.tsx)
│   │   └── product-stats.test.ts     # NEW
│   ├── chat/
│   │   ├── product-cards.ts          # NEW — parse toolEvents → deduped retrieved-product map; card list (cap 5 + overflow); shared by cards + inline links
│   │   └── product-cards.test.ts     # NEW
│   └── ai/
│       └── chat-config.ts            # EDIT — CHAT_SYSTEM_PROMPT: instruct `[Name](product:<id>)` linking; relax the "IDs only when asked" line
├── app/
│   ├── api/products/[id]/route.ts    # EDIT — GET returns ProductWithStats (additive superset)
│   └── (main)/dashboard/
│       ├── products/
│       │   ├── page.tsx              # EDIT — call shared getAllProductsWithStats (delete inline copy)
│       │   └── _components/
│       │       └── products-view.tsx # EDIT — re-export ProductWithStats from the shared module (keep existing import sites working)
│       └── chat/_components/
│           ├── chat-product-context.tsx        # NEW — React context: { openProduct(id), retrievedProducts }
│           ├── chat-product-dialog-provider.tsx # NEW — owns fetch-by-id + ProductDetailDialog; provides context
│           ├── use-chat-product-dialog.ts      # NEW — fetch/hydrate hook (id → ProductWithStats; 404 → toast)
│           ├── chat-product-cards.tsx           # NEW — renders the ≤5 card list + "+N more"
│           ├── chat-page-client.tsx             # EDIT — wrap thread in provider
│           ├── chat-message.tsx                 # EDIT — render <ChatProductCards> from message.toolEvents
│           └── markdown-content.tsx             # EDIT — allow `product:` scheme + custom <a> → openProduct
└── test/
    └── api/products/by-id.test.ts    # NEW — route enrichment test (or colocated)
```

**Structure Decision**: Web application, `apps/web` only. The feature reuses three
existing assets verbatim — `ProductDetailDialog`, `useCheckPrice`, `useUpdateInfo`
— and removes duplication by promoting `getProductsWithStats` and the
`ProductWithStats` type to a shared module that both the products page and the new
chat path import.

## Key Design Decisions (reuse-first)

1. **Single stats source of truth.** `getProductsWithStats()` currently lives
   privately in `products/page.tsx`. Promote it to `lib/products/product-stats.ts`
   as `getAllProductsWithStats()` + `getProductWithStats(id)` sharing one
   per-product mapper. Move the `ProductWithStats` type there; re-export from
   `products-view.tsx` so existing import sites are untouched. (DRY; constitution II.)

2. **Additive by-id enrichment.** `GET /api/products/[id]` returns the full
   `ProductWithStats` as `product`. Because that object is a **superset** of the
   raw row, the existing consumer (`useGlobalProductSearch.selectProduct` →
   `normalizeProductSearchResult`, which reads only `name`/`url`/`active`/…) keeps
   working unchanged. JSON serializes `Date` → ISO string; the chat hydration hook
   revives the date fields before handing the object to the dialog.

3. **One extractor, two surfaces.** `lib/chat/product-cards.ts` parses an
   assistant message's `toolEvents` (the AI SDK stores each tool's raw MCP
   `CallToolResult` in `event.result`). For each **completed** `search_products` /
   `semantic_search_products` event it reads `content[].text`, `JSON.parse`s it,
   and validates an array of `{ id, name, url, currentPriceFormatted, … }` with
   **Zod**. It returns (a) an ordered, **deduped-by-id** map of every retrieved
   product this message (powering inline-link resolution) and (b) the first **5**
   plus an overflow count (powering the cards). "No products found" sentences and
   `failed` events parse to nothing → no cards (FR-004/FR-008).

4. **Inline links resolve against retrieved products.** The model is prompted to
   write `[Name](product:<id>)`. `markdown-content.tsx` allows the `product:`
   scheme and renders a custom `<a>`: if `<id>` is in this message's retrieved-set,
   it becomes a button calling `openProduct(id)`; otherwise the link is dropped and
   the text renders plain (FR-005 fail-safe — an inline mention can only open a
   product the assistant actually retrieved this turn). Sanitization is otherwise
   unchanged; `javascript:`/`data:` stay blocked.

5. **Reuse the detail dialog and its actions as-is.** A chat-scoped
   `ChatProductDialogProvider` (mirroring the existing
   `GlobalProductSearchDialogProvider` pattern, but opening the **detail** dialog)
   owns the open product + fetch and renders one `<ProductDetailDialog>`. The
   dialog's `useCheckPrice`/`useUpdateInfo` already work standalone, satisfying
   FR-002 with no new variant. Deleted-on-click → 404 → "no longer available"
   toast (FR-007); the open dialog does not live-update (no-auto-refresh rule).

## Testing

Per the repo contract (colocated tests; mock backends at the module boundary):

- `product-stats.test.ts` — single + list mapping, null price/history handling
  (chainable-Drizzle mock).
- `by-id.test.ts` — route returns the enriched `ProductWithStats`; 404 path
  preserved; backward-compatible fields still present.
- `product-cards.test.ts` (highest value, pure) — parses a real `CallToolResult`,
  merges + dedupes across two searches, caps at 5 + correct "+N more", ignores the
  "No products found" sentence, ignores `failed`/non-search tools, tolerates
  malformed JSON.
- `markdown-content.test.tsx` — `product:<id>` with a known id → actionable
  button; unknown id → plain text; existing link/`javascript:` blocking preserved.
- A `chat-message` render test asserting cards appear for a product-returning
  completed tool event and are absent otherwise.

## Complexity Tracking

No constitution violations; section intentionally empty.
