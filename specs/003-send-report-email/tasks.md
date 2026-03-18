# Tasks: Manual Price Report Email

**Input**: Design documents from `/specs/003-send-report-email/`
**Prerequisites**: [plan.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/plan.md), [spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/spec.md), [research.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/research.md), [data-model.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/data-model.md), [manual-report-email.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/contracts/manual-report-email.md), [quickstart.md](/home/onlineeric/repos/price-monitoring-agent/specs/003-send-report-email/quickstart.md)

**Tests**: Add automated coverage in `apps/web/src/test/dashboard/` and focused worker regression coverage in `apps/worker/src/jobs/` because this feature changes user-visible business logic, persistence, direct email delivery behavior, shared reporting logic, and digest regression risk.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to (e.g. `[US1]`, `[US2]`, `[US3]`)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the package, route, and dependency scaffolding required by the design

- [X] T001 Create the shared reporting package scaffold in `packages/reporting/package.json`, `packages/reporting/tsconfig.json`, and `packages/reporting/src/index.ts`
- [X] T002 [P] Add `packages/reporting`, `@react-email/render`, and `date-fns-tz` dependency wiring in `apps/web/package.json`, `apps/worker/package.json`, `packages/reporting/package.json`, and `pnpm-lock.yaml`
- [X] T003 [P] Create manual-report route and API entry files in `apps/web/src/app/(main)/dashboard/send-report/page.tsx`, `apps/web/src/app/api/manual-report/preview/route.ts`, and `apps/web/src/app/api/manual-report/send/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared schema, reporting, and manual-send infrastructure that all stories depend on

**⚠️ CRITICAL**: No user story work should start until this phase is complete

- [X] T004 Add the `manualReportSends` schema and type exports in `packages/db/src/schema.ts` and `packages/db/src/index.ts`
- [X] T005 [P] Implement shared report payload models and active-product builders in `packages/reporting/src/report-snapshot.ts` and `packages/reporting/src/index.ts`
- [X] T006 [P] Implement shared digest email component reuse, HTML rendering helpers, and Resend delivery helpers in `packages/reporting/src/price-digest-email.tsx`, `packages/reporting/src/render-price-report.ts`, and `packages/reporting/src/send-price-report.ts`
- [X] T007 [P] Implement timezone/day-window and reviewed-preview cache helpers in `apps/web/src/lib/manual-report/timezone.ts` and `apps/web/src/lib/manual-report/preview-cache.ts`
- [X] T008 [P] Implement recipient parsing and manual-send quota services in `apps/web/src/lib/manual-report/recipient-list.ts` and `apps/web/src/lib/manual-report/send-limits.ts`

**Checkpoint**: Shared reporting and quota infrastructure are ready for story work

---

## Phase 3: User Story 1 - Preview and send the current report on demand (Priority: P1) 🎯 MVP

**Goal**: Let users preview the stored active-product report and send it directly to validated recipients without refreshing prices first

**Independent Test**: Open `/dashboard/send-report`, confirm the preview uses stored product data only, send to one or more valid recipients, and verify no price-refresh activity or new price records are created by the report-only flow

### Verification for User Story 1

- [X] T009 [P] [US1] Add shared-email-preview rendering, recipient validation, and retry-state coverage in `apps/web/src/test/dashboard/send-report-page.test.tsx`
- [X] T010 [P] [US1] Add rolling-window, daily-limit, preview-id parity, reviewed-HTML preview contract, and direct-send API coverage in `apps/web/src/test/dashboard/send-report-limits.test.ts`

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement the preview contract and cached reviewed-preview response with `previewId`, `subject`, and rendered HTML in `apps/web/src/app/api/manual-report/preview/route.ts`
- [X] T012 [P] [US1] Implement the direct-send contract, atomic limit enforcement, and completed-send persistence in `apps/web/src/app/api/manual-report/send/route.ts`
- [X] T013 [P] [US1] Build recipient input and rendered-email preview presentation components in `apps/web/src/app/(main)/dashboard/send-report/_components/recipient-input.tsx` and `apps/web/src/app/(main)/dashboard/send-report/_components/manual-report-preview.tsx`
- [X] T014 [US1] Implement preview loading, send submission, retry-preserved state, and disabled limit messaging in `apps/web/src/app/(main)/dashboard/send-report/_components/manual-report-page-client.tsx`
- [X] T015 [US1] Create the dedicated report-only page shell in `apps/web/src/app/(main)/dashboard/send-report/page.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Access the report workflow from the dashboard navigation (Priority: P2)

**Goal**: Make the report-only page discoverable from the dashboard sidebar

**Independent Test**: Open the dashboard sidebar, select `Send Report to Emails`, and confirm it opens the dedicated report page with preview, recipients, and send action available

### Verification for User Story 2

- [X] T016 [P] [US2] Add sidebar navigation and route-open coverage in `apps/web/src/test/dashboard/send-report-routes.test.ts`

### Implementation for User Story 2

- [X] T017 [P] [US2] Add the `Send Report to Emails` sidebar item in `apps/web/src/navigation/sidebar/sidebar-items.ts`
- [X] T018 [US2] Ensure the dashboard sidebar renders and highlights the new send-report entry in `apps/web/src/app/(main)/dashboard/_components/sidebar/nav-main.tsx`

**Checkpoint**: User Stories 1 and 2 both work independently

---

## Phase 5: User Story 3 - Keep existing digest behavior intact (Priority: P3)

**Goal**: Preserve the current refresh-first manual and scheduled digest behavior while reusing the new shared reporting code

**Independent Test**: Trigger the existing combined digest flow and the scheduled digest completion path, then confirm both still refresh active products before sending the report and remain unaffected by manual report-only quotas

### Verification for User Story 3

- [X] T019 [P] [US3] Add shared reporting regression coverage for active-product filtering, shared template rendering, and recipient formatting in `apps/web/src/test/dashboard/shared-reporting.test.ts`
- [X] T020 [P] [US3] Add combined digest trigger and scheduled digest completion regression coverage in `apps/web/src/test/dashboard/digest-trigger-route.test.ts` and `apps/worker/src/jobs/sendDigest.test.ts`

### Implementation for User Story 3

- [X] T021 [P] [US3] Adapt shared reporting helpers for explicit `sendPriceReportEmail` reuse, HTML preview rendering, and refresh-first digest composition in `packages/reporting/src/report-snapshot.ts`, `packages/reporting/src/render-price-report.ts`, `packages/reporting/src/send-price-report.ts`, and `packages/reporting/src/index.ts`
- [X] T022 [US3] Refactor the worker digest completion flow to compose an explicit refresh-only `updatePrices` path with `packages/reporting` send helpers in `apps/worker/src/jobs/sendDigest.ts` and `apps/worker/src/services/update-prices.ts`
- [X] T023 [US3] Replace worker-only email rendering and sending code with `packages/reporting` compatibility wrappers in `apps/worker/src/services/emailService.ts` and `apps/worker/src/emails/PriceDigest.tsx`
- [X] T024 [US3] Keep the manual combined digest trigger queue-based and exempt from manual-report safeguards in `apps/web/src/app/api/digest/trigger/route.ts` and `apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.tsx`

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation, operator guidance, and cross-story validation

- [X] T025 [P] Update direct-send runtime and operator guidance, including legacy digest env expectations, in `docs/production-env.md` and `specs/003-send-report-email/quickstart.md`
- [X] T026 [P] Review manual-report error logging and user-facing limit/provider messages in `apps/web/src/app/api/manual-report/send/route.ts` and `apps/web/src/app/(main)/dashboard/send-report/_components/manual-report-page-client.tsx`
- [X] T027 Update final verification steps and expected commands in `specs/003-send-report-email/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2
- **User Story 2 (Phase 4)**: Depends on User Story 1 because the navigation target page is delivered there
- **User Story 3 (Phase 5)**: Depends on Phase 2 and can proceed independently of User Story 2
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1**: No dependency on other user stories once foundation is ready
- **US2**: Depends on US1 because the dedicated send-report page must already exist
- **US3**: No dependency on US1 or US2 beyond the shared foundation; it protects the legacy digest flow

### Within Each User Story

- Write or update automated verification before or alongside implementation
- Finish server contracts and shared helpers before wiring the page UI
- Finish route wiring before sidebar discoverability work
- Complete worker refactors before validating digest regression behavior

### Parallel Opportunities

- `T002` and `T003` can run in parallel after `T001`
- `T005`, `T006`, `T007`, and `T008` can run in parallel after `T004`
- `T009` and `T010` can run in parallel for US1
- `T011`, `T012`, and `T013` can run in parallel for US1 before `T014`
- `T017` can run in parallel with `T016` for US2
- `T019` and `T020` can run in parallel for US3
- `T021` and `T024` can run in parallel for US3 before `T022`
- `T025` and `T026` can run in parallel in the polish phase

---

## Parallel Example: User Story 1

```bash
Task: "T009 [US1] Add shared-email-preview rendering and retry-state coverage in apps/web/src/test/dashboard/send-report-page.test.tsx"
Task: "T010 [US1] Add rolling-window, daily-limit, reviewed-HTML preview contract, and preview-id parity coverage in apps/web/src/test/dashboard/send-report-limits.test.ts"

Task: "T011 [US1] Implement the reviewed-preview contract in apps/web/src/app/api/manual-report/preview/route.ts"
Task: "T013 [US1] Build recipient input and rendered-email preview components in apps/web/src/app/(main)/dashboard/send-report/_components/recipient-input.tsx and apps/web/src/app/(main)/dashboard/send-report/_components/manual-report-preview.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "T016 [US2] Add sidebar navigation coverage in apps/web/src/test/dashboard/send-report-routes.test.ts"
Task: "T017 [US2] Add the Send Report to Emails sidebar item in apps/web/src/navigation/sidebar/sidebar-items.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T019 [US3] Add shared reporting regression coverage in apps/web/src/test/dashboard/shared-reporting.test.ts"
Task: "T020 [US3] Add combined digest trigger and scheduled digest completion regression coverage in apps/web/src/test/dashboard/digest-trigger-route.test.ts and apps/worker/src/jobs/sendDigest.test.ts"

Task: "T021 [US3] Adapt shared reporting helpers in packages/reporting/src/report-snapshot.ts, packages/reporting/src/render-price-report.ts, packages/reporting/src/send-price-report.ts, and packages/reporting/src/index.ts"
Task: "T024 [US3] Keep the manual combined digest trigger queue-based in apps/web/src/app/api/digest/trigger/route.ts and apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational shared reporting, quota, and persistence work
3. Complete Phase 3: User Story 1
4. Run `pnpm --filter @price-monitor/web test`
5. Validate `/dashboard/send-report` manually before expanding scope

### Incremental Delivery

1. Finish Setup + Foundational so shared reporting and quota services are stable
2. Deliver US1 for direct preview and send without refresh
3. Add US2 for dashboard discoverability
4. Add US3 for worker/digest regression safety
5. Finish docs and quickstart validation

### Suggested MVP Scope

- Deliver **User Story 1** first because it provides the new user value and exercises the highest-risk direct-send behavior
- Keep **User Story 2** and **User Story 3** as follow-up increments once the shared reporting foundation is stable

## Notes

- [P] tasks touch different files and are intended to avoid merge conflicts
- Every user story phase includes its own verification so it can be shipped independently
- The task list assumes `packages/reporting` becomes the canonical home for report payload, digest email rendering, and delivery logic
