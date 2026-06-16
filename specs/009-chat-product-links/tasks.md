---

description: "Task list for Clickable Products in Chat Replies (009)"
---

# Tasks: Clickable Products in Chat Replies

**Input**: Design documents from `/specs/009-chat-product-links/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the repository contract requires a colocated test update in the
same change as any application-code change (`CLAUDE.md` → Lint & Tests). Tests here
are therefore part of each task group, not optional.

**Organization**: Grouped by user story. US1 (cards) is the MVP and is independently
shippable; US2 (inline links) layers on top and reuses the same data plumbing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = product cards, US2 = inline product links
- All paths are repository-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm scope; no new dependencies, no schema/migration, no env vars.

- [X] T001 Confirm no new packages/migrations are needed and the feature is `apps/web`-only (per plan.md Technical Context); ensure dev stack runs (`pnpm docker:up`, `pnpm mcp:dev`, `pnpm worker:dev`, web dev) so searches return products for manual checks.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data + dialog plumbing that BOTH user stories depend on (a single
stats source, the by-id hydration route, the one tool-result extractor, and the
chat-scoped detail-dialog provider). No user-visible product surface exists yet after
this phase — `openProduct(id)` works but nothing calls it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Create `apps/web/src/lib/products/product-stats.ts`: move the `ProductWithStats` type out of `products-view.tsx` and extract `getProductsWithStats()` from `apps/web/src/app/(main)/dashboard/products/page.tsx` into `getAllProductsWithStats()` plus a single-product `getProductWithStats(id)`, sharing one per-product mapper (Drizzle query builder only; integer cents preserved).
- [X] T003 [P] Add `apps/web/src/lib/products/product-stats.test.ts`: cover single + list mapping, null price/empty history, 30-day window (chainable-Drizzle mock pattern).
- [X] T004 Update `apps/web/src/app/(main)/dashboard/products/page.tsx` to import `getAllProductsWithStats` from the shared module and delete the inline copy (depends on T002; behavior unchanged).
- [X] T005 Update `apps/web/src/app/(main)/dashboard/products/_components/products-view.tsx` to re-export `ProductWithStats` from the shared module so all existing import sites keep working (depends on T002).
- [X] T006 Enrich `GET` in `apps/web/src/app/api/products/[id]/route.ts` to return the full `ProductWithStats` as `product` via `getProductWithStats(id)` (additive superset; keep 404/500 paths) per `contracts/products-by-id.md` (depends on T002).
- [X] T007 [P] Add a route test (`apps/web/src/test/api/products/by-id.test.ts`): enriched shape returned, 404 preserved, and the fields `normalizeProductSearchResult` relies on (`id`/`name`/`url`/`active`/`updatedAt`) still present (backward-compat).
- [X] T008 [P] Create `apps/web/src/lib/chat/product-cards.ts`: the pure extractor per `contracts/chat-product-cards.md` — Zod-validate completed `search_products`/`semantic_search_products` results from `ToolCallEvent[]`, merge + dedupe by `id`, return `{ byId, cards (≤5), overflowCount }`; swallow non-JSON / "No products found." / failed events.
- [X] T009 [P] Add `apps/web/src/lib/chat/product-cards.test.ts`: single search, two-search dedupe + order, >5 cap + overflow count, no-match sentence → empty, failed/non-search ignored, malformed JSON → empty (no throw).
- [X] T010 Create `apps/web/src/app/(main)/dashboard/chat/_components/use-chat-product-dialog.ts`: fetch `/api/products/${id}`, revive ISO date fields into `Date`, build `ProductWithStats`; on 404 show a "no longer available" toast (FR-007); expose `{ openProduct, product, open, onOpenChange }` (depends on T006).
- [X] T011 [P] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-product-context.tsx`: React context exposing `openProduct(id: string) => void` with a `useChatProduct()` accessor.
- [X] T012 Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-product-dialog-provider.tsx`: owns `use-chat-product-dialog`, provides the context, and renders one reused `<ProductDetailDialog>` (mirrors the existing `GlobalProductSearchDialogProvider` shape but opens the detail dialog) (depends on T010, T011).
- [X] T013 Mount `<ChatProductDialogProvider>` around `<ChatThread>` in `apps/web/src/app/(main)/dashboard/chat/_components/chat-page-client.tsx` (depends on T012).

**Checkpoint**: Hydrate-and-open plumbing is live and unit-tested; detail dialog opens for a given id and its Check/Update actions work standalone (FR-002). No card or link surface yet.

---

## Phase 3: User Story 1 - Open a product from search-result cards (Priority: P1) 🎯 MVP

**Goal**: Each reply that retrieved products shows a clickable, deduplicated list of
up to 5 products (name + price) that open the detail dialog.

**Independent Test**: Ask a search query → a ≤5 card list appears with name + price →
clicking a card opens the correct product's detail dialog, conversation preserved;
a no-match query shows no list.

- [X] T014 [US1] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-product-cards.tsx`: render the `cards` list (name + `currentPriceFormatted`, placeholder when null) and a "+N more matched" line when `overflowCount > 0`; each card is a keyboard-operable button calling `openProduct(id)` from `useChatProduct()` with an `aria-label` (FR-001/FR-002/FR-009/FR-010).
- [X] T015 [US1] Wire cards into `apps/web/src/app/(main)/dashboard/chat/_components/chat-message.tsx`: in `AssistantBubble`, compute the surface via `product-cards.ts` from `message.toolEvents` and render `<ChatProductCards>` after the prose only when `cards.length > 0` (no surface otherwise — FR-008) (depends on T008, T014).
- [X] T016 [P] [US1] Add `apps/web/src/app/(main)/dashboard/chat/_components/chat-product-cards.test.tsx`: renders ≤5 cards, shows "+N more" on overflow, renders nothing on empty surface, and a card click invokes `openProduct` with the right id.
- [X] T017 [P] [US1] Extend the chat-message render test (`chat-message.test.tsx`): cards appear for a completed product tool event and are absent for a text-only / non-search reply.

**Checkpoint**: US1 fully functional and demoable — the MVP. Stop and validate against quickstart US1 steps.

---

## Phase 4: User Story 2 - Open a product from inline mentions (Priority: P2)

**Goal**: Product names the assistant writes in prose are clickable and open the same
dialog; unresolvable mentions fail safe to plain text.

**Independent Test**: Ask a query where the assistant names a product in a sentence →
that name is interactive and opens the correct dialog; a reference to a product not
retrieved this turn renders as ordinary text.

- [X] T018 [US2] Update `apps/web/src/app/(main)/dashboard/chat/_components/markdown-content.tsx` per `contracts/product-link-scheme.md`: allow the `product:` scheme in `safeUrlTransform`; add a custom Streamdown `a` component that, for `product:<id>` where `<id>` is in the message's retrieved-set, renders a button calling `openProduct(id)`, else renders the link text as plain text; keep `javascript:`/`data:` blocked (depends on T008, T011).
- [X] T019 [US2] Thread the per-message retrieved-set (`byId`) into `MarkdownContent` from `chat-message.tsx` so inline links resolve against the products that message retrieved (depends on T015, T018).
- [X] T020 [US2] Update `CHAT_SYSTEM_PROMPT` in `apps/web/src/lib/ai/chat-config.ts`: instruct the model to write referenced products as `[Name](product:<id>)` using the exact tool-result `id` (only products retrieved this turn; never show raw ids), and adjust the "only include URLs or IDs when the user asks" Style line so it does not contradict the sanctioned link form.
- [X] T021 [P] [US2] Update `apps/web/src/app/(main)/dashboard/chat/_components/markdown-content.test.tsx`: `product:<knownId>` → actionable button (invokes `openProduct`); `product:<unknownId>` → plain text, no action; `javascript:`/non-image `data:` still neutralized; ordinary `https:` links still render as anchors.

**Checkpoint**: US1 + US2 both work independently; inline links are provably fail-safe (FR-005).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verification, accessibility, and docs.

- [X] T022 [P] Accessibility pass: verify every card and inline product link is keyboard-reachable/operable and has a meaningful accessible name (FR-010 / SC-005).
- [X] T023 [P] Update `CLAUDE.md` (Architecture → Web App UI / Recent Changes) to note that chat replies surface clickable product cards + inline links opening the reused product detail dialog (constitution V — document behavior change). `AGENTS.md` updates automatically (hard link).
- [X] T024 Run the full gate: `pnpm --filter @price-monitor/web test` and `pnpm lint` (review any unsafe-fix diff); fix failures.
- [ ] T025 Run `specs/009-chat-product-links/quickstart.md` manual validation (US1, US2, edge cases incl. delete-on-click, non-product reply, multi-search dedupe).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; BLOCKS both user stories.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after Foundational; independent of US1 (both call `openProduct`; US2 also reuses the extractor). Can be built in parallel with US1 by a second developer.
- **Polish (Phase 5)**: after the desired stories are complete.

### Within Foundational

- T002 unblocks T004/T005/T006 (shared type + helper).
- T006 unblocks T010 (route contract for hydration).
- T010 + T011 unblock T012 → T013.
- T008/T009 (extractor) are independent of the stats/route chain.

### Within Each Story

- US1: T014 → T015; tests T016/T017 in parallel after their targets exist.
- US2: T018 → T019; T020 (prompt) independent; test T021 after T018.

### Parallel Opportunities

- Foundational: T002+T008 (and their tests T003/T009) run in parallel; T007 parallel to the extractor chain; T011 parallel to T010.
- US1 and US2 phases can proceed in parallel once Foundational is done.
- All `[P]` test tasks run alongside sibling tasks in different files.

---

## Parallel Example: Foundational

```bash
# Two independent chains after T002 lands:
Task: "T008 product-cards.ts extractor"      # chat parse path
Task: "T006 enrich /api/products/[id] route" # hydration path
# With their tests:
Task: "T009 product-cards.test.ts"
Task: "T007 by-id route test"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (critical) → 3. Phase 3 US1 → **STOP & validate** (quickstart US1) → demo: clickable cards opening the detail dialog from chat.

### Incremental Delivery

1. Foundational ready (plumbing + dialog open works).
2. US1 (cards) → validate → demo (MVP).
3. US2 (inline links) → validate → demo.
4. Polish (a11y, docs, full test/lint gate, quickstart).

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Reuse-first (user directive): no new detail UI, no second stats query, one extractor for both surfaces; `ProductDetailDialog` / `useCheckPrice` / `useUpdateInfo` reused unchanged.
- No DB migration, no worker/mcp-server change, no new env vars.
- Commit after each task or logical group; keep migrations additive (N/A here).
