# Tasks: Global Product Search Edit Dialog

**Input**: Design documents from `/specs/001-product-search-edit/`
**Prerequisites**: [plan.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/plan.md), [spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/spec.md), [research.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/research.md), [data-model.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/data-model.md), [contracts/product-search-edit.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/contracts/product-search-edit.md), [quickstart.md](/home/onlineeric/repos/price-monitoring-agent/specs/001-product-search-edit/quickstart.md)

**Tests**: Include automated dashboard interaction coverage in `apps/web/src/test/dashboard/` because this feature changes user-visible business logic, shared overlay orchestration, and route-specific refresh behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `[US1]`, `[US2]`, `[US3]`)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared product-search/edit module boundaries and test targets before implementation

- [X] T002 [P] Create the `product-search` component folder under `apps/web/src/app/(main)/dashboard/_components/product-search/` for provider, state, and result-item modules
- [X] T003 [P] Create the shared edit-product module folder under `apps/web/src/app/(main)/dashboard/products/_components/edit-product/` for reusable schema, hook, and dialog modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared edit dialog and dashboard-scoped overlay controller that all stories depend on

**⚠️ CRITICAL**: No user story work should start until this phase is complete

- [X] T004 [P] Extract the edit form schema and types into `apps/web/src/app/(main)/dashboard/products/_components/edit-product/edit-product-form-schema.ts`
- [X] T005 [P] Extract shared edit submit logic into `apps/web/src/app/(main)/dashboard/products/_components/edit-product/use-edit-product.ts`
- [X] T006 Create the reusable shared edit dialog component in `apps/web/src/app/(main)/dashboard/products/_components/edit-product/shared-edit-product-dialog.tsx`
- [X] T007 Update `apps/web/src/app/(main)/dashboard/products/_components/edit-product-dialog.tsx` to wrap the shared edit dialog with Products-page-specific refresh behavior
- [X] T008 Create the dashboard-scoped global search/edit provider in `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx`
- [X] T009 Wire the provider into `apps/web/src/app/(main)/dashboard/_components/dashboard-client-shell.tsx` so the overlay flow is available from any dashboard route

**Checkpoint**: Shared edit and global overlay infrastructure are ready for story work

---

## Phase 3: User Story 1 - Search products from anywhere (Priority: P1) 🎯 MVP

**Goal**: Replace template search items with real product results that load in the global dialog and filter by product name or URL

**Independent Test**: Open the header search from multiple dashboard pages, confirm it loads real products with loading/empty states, and verify filtering plus active/inactive grouping without opening edit

### Verification for User Story 1

- [X] T010 [P] [US1] Add provider/search dialog interaction coverage for loading, filtering, empty state, and active-first grouping in `apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx`
- [X] T011 [P] [US1] Add focused rendering coverage for product result rows in `apps/web/src/test/dashboard/global-product-search-results.test.tsx`

### Implementation for User Story 1

- [X] T012 [P] [US1] Add product search result normalization types and helpers in `apps/web/src/app/(main)/dashboard/_components/product-search/product-search-model.ts`
- [X] T013 [P] [US1] Implement product loading and client-side query filtering in `apps/web/src/app/(main)/dashboard/_components/product-search/use-global-product-search.ts`
- [X] T014 [P] [US1] Implement grouped product result row rendering in `apps/web/src/app/(main)/dashboard/_components/product-search/product-search-result-item.tsx`
- [X] T015 [US1] Replace template command content with live product states in `apps/web/src/app/(main)/dashboard/_components/sidebar/search-dialog.tsx`
- [X] T016 [US1] Connect the header search button and `Cmd/Ctrl+J` shortcut to the provider-backed search flow in `apps/web/src/app/(main)/dashboard/_components/sidebar/search-dialog.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Edit a product from search results (Priority: P2)

**Goal**: Let users select a search result and launch the same edit-product dialog behavior used on the Products page

**Independent Test**: Open global search from a non-Products dashboard route, choose a result, and confirm search closes before the shared edit dialog opens with the selected product data and normal save/cancel behavior

### Verification for User Story 2

- [X] T017 [P] [US2] Add provider-level interaction coverage for search selection, overlay sequencing, cancel, save-failure retry, and unavailable-product recovery in `apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx`
- [X] T018 [P] [US2] Add shared edit dialog coverage for reused validation and submit behavior in `apps/web/src/test/dashboard/shared-edit-product-dialog.test.tsx`

### Implementation for User Story 2

- [X] T019 [P] [US2] Add selected-product loading and unavailable-product recovery handling to `apps/web/src/app/(main)/dashboard/_components/product-search/use-global-product-search.ts`
- [X] T020 [P] [US2] Render the shared edit dialog from the global provider in `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx`
- [X] T021 [US2] Connect search result selection events in `apps/web/src/app/(main)/dashboard/_components/sidebar/search-dialog.tsx` to provider-owned actions without duplicating overlay sequencing logic
- [X] T022 [US2] Replace direct `EditProductDialog` state management with the shared edit dialog wrapper in `apps/web/src/app/(main)/dashboard/products/_components/product-card-view.tsx`
- [X] T023 [US2] Replace direct `EditProductDialog` state management with the shared edit dialog wrapper in `apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx`

**Checkpoint**: User Stories 1 and 2 both work independently

---

## Phase 5: User Story 3 - Preserve page context after global edit (Priority: P3)

**Goal**: Keep the overlay flow route-aware so refresh happens only on the Products page while focus and page context are preserved everywhere

**Independent Test**: Launch the flow from `/dashboard/products` and from another dashboard page, then verify post-save refresh differs by route while cancel/dismiss never refreshes and duplicate opens never stack

### Verification for User Story 3

- [X] T024 [P] [US3] Add route-aware refresh and duplicate-open coverage in `apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx`
- [X] T025 [P] [US3] Add Products-page edit dialog wrapper coverage for route-specific completion behavior in `apps/web/src/test/dashboard/edit-product-dialog.test.tsx`

### Implementation for User Story 3

- [X] T026 [P] [US3] Add origin pathname, trigger focus restoration, and duplicate-open protection to `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx`
- [X] T027 [P] [US3] Add caller-controlled success handling and retry-safe error state to `apps/web/src/app/(main)/dashboard/products/_components/edit-product/shared-edit-product-dialog.tsx`
- [X] T028 [US3] Trigger `router.refresh()` only for `/dashboard/products` in `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx`
- [X] T029 [US3] Ensure the search/edit flow closes cleanly without page refresh on cancel or non-Products save success in `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx`

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation updates that span the full feature

- [X] T030 [P] Update feature notes and verification commands in `specs/001-product-search-edit/quickstart.md`
- [X] T031 Record the dashboard verification command and expected outcome in `specs/001-product-search-edit/quickstart.md`
- [X] T032 [P] Review `apps/web/src/app/(main)/dashboard/_components/sidebar/search-dialog.tsx` and `apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx` for loading/error copy and focus accessibility polish

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2
- **User Story 2 (Phase 4)**: Depends on Phase 2 and builds on US1 search results
- **User Story 3 (Phase 5)**: Depends on Phase 2 and the shared search/edit flow from US2
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1**: No dependency on other user stories once foundation is ready
- **US2**: Depends on US1 because product selection requires the real search result list
- **US3**: Depends on US2 because route-aware completion applies to the global edit flow

### Within Each User Story

- Write or update automated verification before or alongside implementation
- Build data normalization/hooks before wiring UI
- Wire UI states before adding route-aware completion behavior
- Finish story-level validation before moving to the next priority

### Parallel Opportunities

- `T002` and `T003` can run in parallel
- `T004` and `T005` can run in parallel before `T006`
- `T010` and `T011` can run in parallel for US1
- `T012`, `T013`, and `T014` can run in parallel before `T015`
- `T017` and `T018` can run in parallel for US2
- `T019` and `T020` can run in parallel before `T021`
- `T022` and `T023` can run in parallel once the shared edit wrapper is ready
- `T024` and `T025` can run in parallel for US3
- `T026` and `T027` can run in parallel before `T028` and `T029`

---

## Parallel Example: User Story 1

```bash
Task: "T010 [US1] Add provider/search dialog interaction coverage in apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx"
Task: "T011 [US1] Add focused rendering coverage in apps/web/src/test/dashboard/global-product-search-results.test.tsx"

Task: "T012 [US1] Add product search result normalization helpers in apps/web/src/app/(main)/dashboard/_components/product-search/product-search-model.ts"
Task: "T014 [US1] Implement grouped product result row rendering in apps/web/src/app/(main)/dashboard/_components/product-search/product-search-result-item.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "T017 [US2] Add provider-level interaction coverage in apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx"
Task: "T018 [US2] Add shared edit dialog coverage in apps/web/src/test/dashboard/shared-edit-product-dialog.test.tsx"

Task: "T022 [US2] Replace direct EditProductDialog state management in apps/web/src/app/(main)/dashboard/products/_components/product-card-view.tsx"
Task: "T023 [US2] Replace direct EditProductDialog state management in apps/web/src/app/(main)/dashboard/products/_components/product-table-view.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "T024 [US3] Add route-aware refresh and duplicate-open coverage in apps/web/src/test/dashboard/global-product-search-dialog-provider.test.tsx"
Task: "T025 [US3] Add Products-page edit dialog wrapper coverage in apps/web/src/test/dashboard/edit-product-dialog.test.tsx"

Task: "T026 [US3] Add pathname/focus/duplicate-open protection in apps/web/src/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider.tsx"
Task: "T027 [US3] Add caller-controlled success handling in apps/web/src/app/(main)/dashboard/products/_components/edit-product/shared-edit-product-dialog.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational shared edit/provider work
3. Complete Phase 3: User Story 1
4. Run `pnpm --filter @price-monitor/web test -- --runInBand src/test/dashboard`
5. Validate the header search on `/dashboard/products` and one non-Products route

### Incremental Delivery

1. Finish shared edit/provider foundation
2. Deliver US1 for real product search results
3. Deliver US2 for shared edit launch from search
4. Deliver US3 for route-aware refresh and focus restoration
5. Run automated and manual quickstart validation after each story

### Suggested MVP Scope

- Deliver **User Story 1** first to replace template search content with real product results
- Keep **User Story 2** and **User Story 3** as follow-up increments once the provider and shared edit dialog foundation is stable
