# Tasks: Global Quick Create Product Dialog

**Input**: Design documents from `/specs/001-quick-create-dialog/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include automated client-side coverage for the shared dialog controller, entry-point parity, submission outcomes, duplicate-open protection, and focus restoration because the specification and constitution require verification for this user-visible workflow.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app work lives under `apps/web/`
- Feature documentation lives under `specs/001-quick-create-dialog/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the missing frontend test tooling and feature-specific verification entry points needed by this UI change.

- [ ] T001 Add a web test script and Vitest, React Testing Library, and jsdom dependencies in `apps/web/package.json`
- [ ] T002 [P] Create the shared web test runner configuration in `apps/web/vitest.config.ts`
- [ ] T003 [P] Create the shared frontend test setup utilities in `apps/web/src/test/setup.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract reusable product-create modules and add a dashboard-scoped dialog controller before wiring any trigger.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Extract the shared product-create schema and form types from the existing dialog into `apps/web/src/app/(main)/dashboard/products/_components/product-create-form-schema.ts`
- [ ] T005 [P] Extract the reusable product-create form fields and submit button UI into `apps/web/src/app/(main)/dashboard/products/_components/product-create-form.tsx`
- [ ] T006 Create a shared create-product submission hook for `/api/products` in `apps/web/src/app/(main)/dashboard/products/_components/use-create-product.ts`
- [ ] T007 Create the dashboard-scoped product-create dialog controller and hook in `apps/web/src/app/(main)/dashboard/_components/product-create/product-create-dialog-provider.tsx`
- [ ] T008 Create a dashboard client shell that mounts the shared dialog host in `apps/web/src/app/(main)/dashboard/_components/dashboard-client-shell.tsx`
- [ ] T009 Wire the dashboard client shell into `apps/web/src/app/(main)/dashboard/layout.tsx`

**Checkpoint**: Foundation ready; sidebar and Products page triggers can now share one dialog host and one submission path.

---

## Phase 3: User Story 1 - Open product creation from anywhere (Priority: P1) 🎯 MVP

**Goal**: Make the sidebar `Quick Create` action and the Products page button open the same add-product dialog from any dashboard route without navigation.

**Independent Test**: Open `/dashboard/products` plus at least two non-Products dashboard routes, trigger both entry points where available, and confirm the same add-product dialog opens in place with matching fields and labels.

### Verification for User Story 1

- [ ] T010 [P] [US1] Add controller and entry-point parity component tests in `apps/web/src/app/(main)/dashboard/_components/product-create/product-create-dialog-provider.test.tsx`

### Implementation for User Story 1

- [ ] T011 [P] [US1] Refactor `Add Product` to use the shared open action in `apps/web/src/app/(main)/dashboard/products/_components/add-product-button.tsx`
- [ ] T012 [P] [US1] Make the sidebar `Quick Create` action open the shared dialog in `apps/web/src/app/(main)/dashboard/_components/sidebar/nav-main.tsx`
- [ ] T013 [US1] Refactor the dialog component to render from the shared controller in `apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.tsx`

**Checkpoint**: User Story 1 is complete when both entry points open the same dialog host on the current dashboard route.

---

## Phase 4: User Story 2 - Complete product creation from the sidebar entry point (Priority: P2)

**Goal**: Ensure product creation launched from `Quick Create` reuses the same validation, submission, and success/error behavior as the Products page add flow.

**Independent Test**: Launch the dialog from `Quick Create`, submit valid and invalid data, and confirm the creation, validation, toast, close, and refresh behavior matches the Products page flow while only refreshing when launched from Products.

### Verification for User Story 2

- [ ] T014 [P] [US2] Add submission outcome tests for valid, invalid, and failed requests in `apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.test.tsx`

### Implementation for User Story 2

- [ ] T015 [P] [US2] Rebuild the dialog around the shared schema, form component, and submit hook in `apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.tsx`
- [ ] T016 [US2] Normalize optional product names and preserve existing toast behavior in `apps/web/src/app/(main)/dashboard/products/_components/use-create-product.ts`
- [ ] T017 [US2] Add route-aware success handling so refresh only occurs for the Products page in `apps/web/src/app/(main)/dashboard/_components/product-create/product-create-dialog-provider.tsx`

**Checkpoint**: User Story 2 is complete when sidebar-launched product creation behaves the same as the Products page flow and refresh behavior matches the route requirement.

---

## Phase 5: User Story 3 - Preserve context and predictable closing behavior (Priority: P3)

**Goal**: Keep the global dialog idempotent, dismissible, and accessible so users return to the same page context and trigger after closing.

**Independent Test**: Open `Quick Create` from multiple dashboard routes, cancel, dismiss, submit, and re-click the trigger while open to confirm no stacked dialog appears and focus returns to the originating trigger on close.

### Verification for User Story 3

- [ ] T018 [P] [US3] Add duplicate-open and focus-restoration tests in `apps/web/src/app/(main)/dashboard/_components/product-create/product-create-dialog-provider.test.tsx`

### Implementation for User Story 3

- [ ] T019 [US3] Add duplicate-open guards, origin trigger tracking, and focus restoration in `apps/web/src/app/(main)/dashboard/_components/product-create/product-create-dialog-provider.tsx`
- [ ] T020 [US3] Preserve cancel and dismiss behavior without mutating unrelated page state in `apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.tsx`

**Checkpoint**: User Story 3 is complete when repeated opens are ignored, the dialog closes cleanly, and focus returns to the initiating `Quick Create` control.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation and run the end-to-end validation steps for the feature.

- [ ] T021 [P] Update the implementation and manual validation notes in `specs/001-quick-create-dialog/quickstart.md`
- [ ] T022 Execute the validation checklist in `specs/001-quick-create-dialog/quickstart.md`, including `/dashboard/products` plus at least two non-Products dashboard routes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories because every trigger must share the same dialog controller and test setup.
- **User Story 1 (Phase 3)**: Depends on Foundational completion; delivers the MVP open-from-anywhere behavior.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because submission parity builds on the shared dialog host already wired into both triggers.
- **User Story 3 (Phase 5)**: Depends on User Story 1 and User Story 2 because idempotent close/focus behavior must apply to the completed shared dialog workflow.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on later stories.
- **US2 (P2)**: Starts after US1 shared-open behavior is in place.
- **US3 (P3)**: Starts after the shared open and shared submission flows are stable.

### Within Each User Story

- Write or update verification coverage before closing out implementation.
- Shared controller and extracted product-create modules must land before trigger wiring.
- Trigger wiring must land before route-aware success and focus behavior refinements.

### Parallel Opportunities

- `T002` and `T003` can run in parallel after `T001`.
- `T005` and `T007` can run in parallel after `T004` if the extracted schema contract is agreed.
- `T011` and `T012` can run in parallel once the shared controller exists.
- `T014` can run in parallel with `T015` while the submission refactor is in progress.
- `T021` can run in parallel with final code cleanup once behavior is stable.

---

## Parallel Example: User Story 1

```bash
Task: "Refactor `Add Product` to use the shared open action in apps/web/src/app/(main)/dashboard/products/_components/add-product-button.tsx"
Task: "Make the sidebar `Quick Create` action open the shared dialog in apps/web/src/app/(main)/dashboard/_components/sidebar/nav-main.tsx"
```

---

## Parallel Example: User Story 2

```bash
Task: "Add submission outcome tests for valid, invalid, and failed requests in apps/web/src/app/(main)/dashboard/products/_components/add-product-dialog.test.tsx"
Task: "Normalize optional product names and preserve existing toast behavior in apps/web/src/app/(main)/dashboard/products/_components/use-create-product.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Validate the sidebar and Products page both open the same dialog without navigation.

### Incremental Delivery

1. Deliver shared controller infrastructure and entry-point parity first.
2. Add shared submission parity and route-aware refresh behavior next.
3. Finish idempotent close, focus restoration, and final validation last.

### Suggested MVP Scope

- **MVP**: Through Phase 3 (User Story 1) so `Quick Create` is no longer a no-op and opens the same add-product dialog from anywhere in the dashboard shell.

## Notes

- All tasks follow the required checklist format with sequential IDs, optional `[P]` markers, and `[US#]` labels only inside user story phases.
- The task list stays inside `apps/web` and reuses the existing `/api/products` contract as required by the specification.
