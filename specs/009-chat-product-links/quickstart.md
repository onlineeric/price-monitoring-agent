# Quickstart & Validation: Clickable Products in Chat Replies

A run/validation guide proving the feature works end-to-end. Implementation detail
lives in `tasks.md` (after `/speckit-tasks`) and the code itself.

## Prerequisites

```bash
pnpm docker:up                            # Postgres + Redis
pnpm --filter @price-monitor/db migrate   # ensure schema current (no new migration here)
pnpm mcp:dev                              # MCP server (search tools + embeddings)
pnpm worker:dev                           # worker (for the dialog's Check/Update actions)
pnpm --filter @price-monitor/web dev      # Next.js on :3000
```

Have at least a few monitored products with metadata + a price (run
`pnpm --filter @price-monitor/worker backfill:product-info` and
`backfill:embeddings` if needed) so searches return results.

## Automated checks (the gate)

```bash
pnpm --filter @price-monitor/web test     # unit + route tests for this feature
pnpm lint
```

Expected new/updated tests pass:

- `lib/products/product-stats.test.ts` — single + list stats mapping.
- `api/products/by-id` route test — enriched shape + 404 + backward-compat fields.
- `lib/chat/product-cards.test.ts` — dedupe/cap/overflow, ignore no-match & errors.
- `markdown-content.test.tsx` — `product:<id>` known→button / unknown→plain text;
  `javascript:` still blocked.
- `chat-message` render test — cards present for a completed product tool event.

## Manual validation (maps to acceptance scenarios)

### US1 — cards (P1)

1. Open `/dashboard/chat`. Ask: **"show me the products I'm tracking"** (or a name
   search). → Assistant answers in text **and** a clickable list of ≤5 products
   (name + formatted price) appears. *(FR-001; SC-001)*
2. Click a card. → `ProductDetailDialog` opens for that exact product (image,
   current price + trend, metadata, specs, source link, Check/Update buttons),
   chat still visible beneath. *(FR-002; SC-003)*
3. Close the dialog. → Same conversation, same scroll position, all messages
   intact. *(FR-003; SC-006)*
4. Ask a semantic query (**"something good for video editing"**) that matches > 5
   products. → Exactly 5 cards + a "+N more matched" indicator. *(FR-009; Clarif. 1)*
5. Ask a query that matches nothing. → No card list; text explains nothing
   matched. *(FR-004; FR-008)*

### US2 — inline links (P2)

6. Ask something that makes the assistant name a specific product in prose. → That
   product name is visibly interactive; activating it opens the same dialog for
   that product. *(FR-004; SC-002)*
7. (Fail-safe) If the assistant ever references a product it did not retrieve, the
   mention renders as plain text and does nothing. *(FR-005)*

### Edge cases

8. Delete a product (in another tab), then click its still-shown card/link. →
   "no longer available" toast; conversation stays usable. *(FR-007)*
9. Ask a non-product question. → Reply identical to today; zero clickable product
   surfaces. *(FR-008; SC-004)*
10. Keyboard only: Tab to a card / inline link and activate with Enter/Space. →
    Opens the dialog; focus behaves sensibly. *(FR-010; SC-005)*
11. Trigger a search that returns the same product from both a name and a semantic
    search in one reply. → It appears once in the merged card list. *(Clarif. 3)*

## Action reuse sanity (FR-002)

Inside a dialog opened from chat, click **"Check price now"** and **"Update product
info"**. → Same toasts/behavior as on the products page; jobs enqueue via the
existing routes. The open dialog does not auto-update (no-auto-refresh rule).
