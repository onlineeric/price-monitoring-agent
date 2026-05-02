---

description: "Task list for implementation of Dashboard Chat Page (Streaming UI)"
---

# Tasks: Dashboard Chat Page (Streaming UI)

**Input**: Design documents from `/specs/005-chat-page-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-ui.md, quickstart.md

**Tests**: Automated tests are required by the constitution (Principle IV — Independent, Risk-Proportional Verification) for user-visible business logic. The chat page is user-visible business logic, so each user story includes verification tasks.

**Organization**: Tasks are grouped by user story. Phase 2 contains the shared store/parser/reducer/wrapper layer that all three stories build on; per-story phases each add a thin slice of UI plus its verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to ([US1], [US2], [US3])
- All paths are absolute from repository root

## Path Conventions

- Web app source: `apps/web/src/`
- Tests: `apps/web/src/test/dashboard/chat/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the one new dependency and scaffold the page route.

- [x] T001 Install the `streamdown` Markdown renderer in the web app (`pnpm --filter @price-monitor/web add streamdown`); confirm it shows up under `dependencies` in `apps/web/package.json` with a recent stable version.
- [x] T002 Create the App Router segment for the chat page at `apps/web/src/app/(main)/dashboard/chat/` with a thin server `page.tsx` that simply renders `<ChatPageClient />` (mirror the convention in `apps/web/src/app/(main)/dashboard/send-report/page.tsx`); also create the empty `_components/` subdirectory the rest of Phase 2/3/4/5 will populate.
- [x] T003 [P] Add a "Chat" entry to `apps/web/src/navigation/sidebar/sidebar-items.ts` pointing to `/dashboard/chat` with the `MessageSquare` icon from `lucide-react`, placed in the existing "Main" group between Products and Send Report; confirm the sidebar renders the new link in the running dev server.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the per-tab Zustand store, the v6 stream reducer, the FR-004a history serializer, the in-stream error parser, the auto-scroll hook, and the sanitized Markdown wrapper. All three user stories depend on this layer being in place.

**⚠️ CRITICAL**: No user-story phase work may begin until this phase is complete.

- [x] T004 [P] Create `apps/web/src/stores/chat/types.ts` containing every entity from `data-model.md` §1–§6: `ConversationStatus`, `MessageRole`, `AssistantMessageState`, `UserMessage`, `AssistantMessage`, `DisplayedMessage`, `ToolStatus`, `ToolCallEvent`, `ChatErrorCode`, `ChatError`, `StreamPart` (the v6 UI-message-part discriminated union), and the `ChatState` interface. Keep types small and single-responsibility; export each one named.
- [x] T005 [P] Create `apps/web/src/lib/chat/auto-scroll.ts` exporting a `useAutoScrollToBottom()` React hook that returns `{ scrollContainerRef, sentinelRef, isAtBottom, jumpToLatest }`. Implementation uses `IntersectionObserver` on the sentinel as documented in `research.md` §3 — no scroll-event listeners, no debounce.
- [x] T006 [P] Create `apps/web/src/stores/chat/chat-history.ts` exporting `serializeHistoryForApi(messages)` per `data-model.md` §7. Pure function; do not import from React or Zustand. Drops assistant messages whose state is `streaming`/`stopped`/`errored` and the tool events that belonged to those messages; emits `tool` role messages for every `completed` and `failed` tool event in `complete` assistant turns.
- [x] T007 [P] Create `apps/web/src/lib/chat/chat-error-parsing.ts` per `contracts/chat-ui.md` §6: Zod schema `ChatErrorPayloadSchema` whose `code` enum exactly matches `ChatErrorCode`, a `parseChatErrorPayload(raw, surface)` function that NEVER throws (falls back to `provider_error` with a ≤500-char message), and `isRetryable(code)` per `data-model.md` §4. No regex; use `JSON.parse` + Zod.
- [x] T008 Create `apps/web/src/stores/chat/chat-stream.ts` exporting `consumeChatStream(response, set, signal)` per `contracts/chat-ui.md` §5. Use `readUIMessageStream` from `ai`; exhaustively switch on `StreamPart.type` per the table in `data-model.md` §5; unknown parts log a single `console.warn` and are ignored; `AbortError` is swallowed; any other thrown error is surfaced as a synthetic `provider_error` via `set()`. Depends on T004.
- [x] T009 Create `apps/web/src/stores/chat/chat-store.ts` exporting a module-level Zustand singleton `useChatStore` per `data-model.md` §6 and `contracts/chat-ui.md` §1. Implement `send`, `stop`, `retry`, `reset` per the algorithms in §6; on `send`, generate `conversationId` lazily via `crypto.randomUUID()` if absent; on `stop`, mark every still-`running` tool indicator on the active assistant message as `stopped` in the same `set()` call that flips the message state to `stopped`. Depends on T004, T006, T007, T008.
- [x] T010 [P] Create `apps/web/src/app/(main)/dashboard/chat/_components/markdown-content.tsx` exporting `<MarkdownContent text>`. Wraps the `streamdown` `<Streamdown>` component with our typography Tailwind classes and an explicit allowed-elements config that blocks `<iframe>`, `<script>`, `<style>`, inline `on*` attributes, and unsafe link schemes (`javascript:`, executable `data:`) per `plan.md` Technical Constraints. Pure component, no hooks. Independent of T004–T009.
- [x] T011 [P] Add foundational unit tests for the FR-004a serializer at `apps/web/src/test/dashboard/chat/chat-history.test.ts` that cover: only-user messages, user+complete-assistant pair, complete-assistant with completed and failed tool events (both `tool` messages emitted in order), stopped assistant turn dropped, errored assistant turn dropped, ordering preserved across mixed completed/incomplete turns. Depends on T004 + T006.
- [x] T012 [P] Add foundational unit tests for the error parser at `apps/web/src/test/dashboard/chat/chat-error-parsing.test.ts` that cover: each of the seven `ChatErrorCode` values parses cleanly, malformed JSON falls back to `provider_error` without throwing, payloads with unknown codes fall back to `provider_error`, oversized `message` is bounded to ≤500 chars, `isRetryable` returns the correct boolean for every code (per the FR-009 table). Depends on T007.
- [x] T013 [P] Add foundational unit tests for the store at `apps/web/src/test/dashboard/chat/chat-store.test.ts` that cover: `send` rejects re-entry while `streaming`, `send` generates a `conversationId` on first call only, `stop` flips active assistant to `stopped` and every running tool to `stopped`, `retry` removes the trailing errored assistant and re-sends the prior user text with the same `conversationId`, `reset` aborts an in-flight turn before clearing state, history serializer is invoked correctly inside `send`. Mock `fetch` and `consumeChatStream` (or expose a seam in `chat-store.ts` to inject the stream consumer). Depends on T009.
- [x] T014 [P] Add foundational sanitization tests for the Markdown wrapper at `apps/web/src/test/dashboard/chat/markdown-content.test.tsx`: GFM features render (bullet list, bold, fenced code, inline code, links), `<script>` tags are dropped, `javascript:` URLs are dropped or sanitized to `#`, inline `onerror=` attributes do not survive into the rendered DOM, and pure text passes through unmodified. Depends on T010.

**Checkpoint**: Foundation ready — every user-story phase below can now proceed in parallel.

---

## Phase 3: User Story 1 — Streaming + multi-turn + markdown (Priority: P1) 🎯 MVP

**Goal**: A user can send a message and watch the assistant's reply stream in incrementally with markdown formatting, then send a follow-up that the assistant answers in context.

**Independent Test**: With the dev server running, click "Chat" in the sidebar, send "do I have any products with 'monitor' in the name?", verify text streams in token-by-token and contains real product names; send "what's the price trend on the first one?" and verify the answer references the previous turn.

### Verification for User Story 1 ⚠️

- [x] T015 [P] [US1] Add a streaming integration test at `apps/web/src/test/dashboard/chat/chat-page.streaming.test.tsx` that drives a mocked `fetch` Response whose `body` is a `ReadableStream` of v6 UI-message parts (`start`, `start-step`, `text-delta` × N, `finish-step`, `finish`) into `useChatStore.getState().send(...)` and asserts the assistant bubble's text grows incrementally; second test sends a follow-up and asserts the request body includes the prior turns; third test asserts that pure text deltas containing markdown render through `MarkdownContent`. Tests must fail before T017–T019 land.

### Implementation for User Story 1

- [x] T016 [P] [US1] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-empty-state.tsx` per `contracts/chat-ui.md` §3. Renders a short helper paragraph plus the three FR-013 starter-prompt chips:
  - Chip 1: "Show me my monitored products." → `autoSend=true`.
  - Chip 2: "What's the price trend on my [first product]?" → **populates the input only (`autoSend=false`)** so the user can replace `[first product]` with the actual product name before sending. The page does NOT auto-fetch product data to substitute — the literal placeholder is the contract.
  - Chip 3: "Add this product: [paste URL]" → `autoSend=false` (populates input; user must paste a URL before sending).
- [x] T017 [P] [US1] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-message.tsx` per `contracts/chat-ui.md` §3. Branch on `message.role`:
  - **user** → plain-text bubble (right-aligned, primary background); never rendered as Markdown.
  - **assistant** — render based on `state`:
    - `streaming` and `text.length === 0` → "thinking" placeholder (animated dots / shimmer); satisfies FR-007a + NFR-002.
    - `streaming` with text → text via `<MarkdownContent>` + tool-indicator slot (US2 fills the slot); wrap the bubble in `aria-live="polite"` + `role="status"` (FR-016).
    - `complete` → text via `<MarkdownContent>` + tool-indicator slot; static (no live region).
    - `stopped` → text via `<MarkdownContent>` + tool-indicator slot + a small "stopped" badge (FR-008 + spec edge case).
    - `errored` → leave room for `<ChatErrorBlock>` to be appended after the streamed-so-far text (T026 fills this in US3).
- [x] T018 [US1] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-thread.tsx` per `contracts/chat-ui.md` §3. Owns the scroll container and the sentinel for `useAutoScrollToBottom`; renders `<ChatEmptyState>` when `messages.length === 0 && error === null`; otherwise renders one `<ChatMessage>` per message; surfaces a "Jump to latest" button when the user has scrolled up. Depends on T005 + T016 + T017.
- [x] T019 [US1] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-page-client.tsx` per `contracts/chat-ui.md` §3. Top-level "use client" component: renders the dashboard-style page header ("Chat" title + short subtitle + a "New chat" button that calls `useChatStore.getState().reset()`), then `<ChatThread>` (no `<ChatInput>` yet — that lands in US3). Empty-state starter chips wire `onSelectPrompt(text, autoSend)` to either pre-fill input or call `send(text)` directly. Depends on T009, T018.

**Checkpoint**: User Story 1 fully functional — streaming text + multi-turn + markdown work end to end. Send is currently triggered by the empty-state chips only; a richer input UI ships in US3.

---

## Phase 4: User Story 2 — Tool-call indicators (Priority: P1)

**Goal**: While the assistant streams an answer that requires data, an inline indicator appears for each MCP tool the model calls, transitioning running → completed (or failed) so the user can see the answer is grounded in real data.

**Independent Test**: With the dev server running, send "show me my monitored products" from the chat page; verify a `search_products` indicator appears inline with a running state and transitions to completed; verify a follow-up causing two tools (`search_products` then `get_price_summary`) renders both indicators in order.

### Verification for User Story 2 ⚠️

- [x] T020 [P] [US2] Add a tool-transitions integration test at `apps/web/src/test/dashboard/chat/chat-page.tools.test.tsx` that drives mocked v6 streams: (a) `tool-call` then `tool-result` with a normal payload → indicator running → completed; (b) `tool-call` then `tool-result` whose `output` carries a `{ error: { code, message } }` envelope → indicator running → failed AND the assistant text continues to stream (turn not aborted by tool failure); (c) two sequential `tool-call`/`tool-result` pairs render two indicators in stream order. Test must fail before T021–T022 land.

### Implementation for User Story 2

- [x] T021 [P] [US2] Create `apps/web/src/app/(main)/dashboard/chat/_components/tool-call-indicator.tsx` per `contracts/chat-ui.md` §3. Compact pill: `[icon] tool_name [status]`. Status icons (lucide-react): `Loader2` animated for `running`, `Check` for `completed`, `AlertCircle` for `failed`, `Square` for `stopped`. Include a placeholder `<button aria-label="Show details">` caret that does nothing in this phase (Phase 3.7 expansion slot). Use `role="status"` while `running`, static otherwise.
- [x] T022 [US2] Wire `<ToolCallIndicator>` into `chat-message.tsx` so each assistant message renders its `toolEvents` inline before/after the streamed text in the order they arrived. Depends on T017 + T021.

**Checkpoint**: User Story 2 functional — both happy-path streaming and grounded-data answers render correctly with visible tool calls.

---

## Phase 5: User Story 3 — Robust error UX, Stop, Retry, char counter, overlap prevention (Priority: P2)

**Goal**: Every documented `/api/chat` error renders as a recognizable in-thread block with retry where retryable; the user can Stop a streaming turn at any point (including during a tool call); the input enforces the 10,000-char cap; sending while a turn is streaming is blocked.

**Independent Test**: Force each failure mode per `quickstart.md` §3; verify each renders a recognizable block with the right Retry presence. Force a long-running turn and click Stop mid-tool; verify the partial assistant + running tool both flip to `stopped`. Type while streaming; verify Send is disabled.

### Verification for User Story 3 ⚠️

- [x] T023 [P] [US3] Add an errors-and-controls integration test at `apps/web/src/test/dashboard/chat/chat-page.errors.test.tsx` that exercises: (a) one test per `ChatErrorCode` (`validation_error`, `provider_config_missing` rendered without Retry; `mcp_unreachable`, `provider_error`, `step_budget_exceeded`, `turn_timeout`, `empty_response` rendered with Retry); pre-stream codes use a mocked `fetch` returning JSON 4xx/5xx, in-stream codes use a mocked stream emitting an `error` part; (b) Stop test — start a never-finishing mock stream, click Stop, assert assistant turn is `stopped`, any running tool indicator is `stopped`, input is interactive, partial text is preserved; (c) overlap test — while one turn is streaming, type a new message and press Enter, assert no second request was fired; (d) char-counter test — typing 8001 chars makes the counter visible, exceeding 10000 disables Send. Test must fail before T024–T028 land.

### Implementation for User Story 3

- [x] T024 [P] [US3] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-error-block.tsx` per `contracts/chat-ui.md` §3. Renders a Shadcn `<Alert variant="destructive">` with title from the error-code → label mapping table (`contracts/chat-ui.md` §3 ChatErrorBlock section), body `error.message`, and a Retry button when `onRetry` is provided AND `isRetryable(error.code)` is true. Depends on T007 (for `isRetryable`).
- [x] T025 [P] [US3] Create `apps/web/src/app/(main)/dashboard/chat/_components/chat-input.tsx` per `contracts/chat-ui.md` §3. Shadcn `<Textarea>` with autosize; Enter and Cmd/Ctrl+Enter submit; Shift+Enter inserts newline; Esc while streaming triggers Stop. Send button enabled iff `status !== "streaming"` and trimmed input is 1..10000 chars; Stop button visible iff streaming. Live character counter visible once length > 8000; Send disabled once length > 10000. Independent of other US3 tasks.
- [x] T026 [US3] Update `chat-message.tsx` so when the assistant message state is `errored`, it appends a `<ChatErrorBlock>` after the streamed-so-far text (in-stream surface OR pre-stream surface — both reach this path because the store appends an empty assistant bubble at the top of `send()` and marks it `errored` on any failure) and passes `onRetry` only when the error is retryable. Depends on T017 + T024 + T009 (store's `retry`).
- [x] T027 [US3] Wire `<ChatInput>` into `chat-page-client.tsx`: pass `status`, `onSend = useChatStore.getState().send`, `onStop = useChatStore.getState().stop`. After every `streaming → idle | errored` transition, refocus the textarea (FR-016). Depends on T019 + T025 + T009.

**Checkpoint**: All three user stories fully functional. The page is the user-visible Phase 3.5 deliverable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Lint/type/test gates, manual quickstart pass, accessibility verification, and a final secrets-leakage spot-check.

- [x] T028 Run `pnpm --filter @price-monitor/web test` from the repo root and confirm every test (foundational + per-story) passes; fix any failures before declaring the feature done.
- [x] T029 Run `pnpm lint` from the repo root and `pnpm --filter @price-monitor/web exec tsc --noEmit` to confirm the type-check is clean across the new and modified files; fix any issues.
- [ ] T030 Walk through `specs/005-chat-page-ui/quickstart.md` §1–§8 (all sections, including provider switch in §7 and mobile/narrow viewport in §8 — the latter exercises NFR-003) against the running dev server (db + redis up, MCP server built, `apps/web` dev) and confirm every "Expect" line passes; record any deviations.
- [ ] T031 [P] Run a Lighthouse accessibility audit on `/dashboard/chat` and confirm the score is comparable to the existing dashboard pages (no new regressions); fix any new violations introduced by this feature.
- [ ] T032 [P] Verify NFR-005 (no client-side leakage of API keys, env var values, or absolute paths) by deliberately triggering each error mode and grepping the rendered DOM and `console.*` output for substrings of the relevant API key + an absolute project path; expect zero hits. If any leak is found, scrub it at the smallest reasonable boundary (likely `chat-error-parsing.ts` or `chat-store.ts`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No prior dependencies — can start immediately.
- **Phase 2 (Foundational)**: Requires Phase 1 (T001 in particular — `streamdown` must be installed before T010). Blocks every story phase.
- **Phase 3 (US1)**: Requires Phase 2.
- **Phase 4 (US2)**: Requires Phase 2 + Phase 3 T017 (extends `chat-message.tsx`).
- **Phase 5 (US3)**: Requires Phase 2 + Phase 3 T017–T019 (extends `chat-message.tsx`, `chat-thread.tsx`, `chat-page-client.tsx`).
- **Phase 6 (Polish)**: Requires every story phase to be complete.

### Within-Phase Dependencies (Phase 2)

- T004 (`types.ts`) blocks T006, T008, T009.
- T006 (`chat-history.ts`) blocks T009 and T011.
- T007 (`chat-error-parsing.ts`) blocks T009, T012, T024.
- T008 (`chat-stream.ts`) blocks T009.
- T009 (`chat-store.ts`) blocks T013, T019, T026, T027.
- T010 (`markdown-content.tsx`) blocks T014, T017.
- T005 (`auto-scroll.ts`) blocks T018.

### Within-Phase Dependencies (Story Phases)

- US1: T015 (test) is independent; T016 + T017 are independent of each other; T018 depends on T016 + T017; T019 depends on T018.
- US2: T020 (test) is independent; T021 is independent; T022 depends on T021 + T017.
- US3: T023 (test) is independent; T024 + T025 are independent of each other; T026 depends on T024; T027 depends on T025.

### Parallel Opportunities

- All `[P]` tasks within a phase can run in parallel.
- After Phase 2 completes, US1 / US2 / US3 phases can run in parallel by different developers because they touch different `_components/*` files for their additions; the only shared files are `chat-message.tsx` (T017/T022/T026 must serialize) and `chat-page-client.tsx` (T019/T027 must serialize). Within a single developer, follow the priority order: US1 → US2 → US3.

---

## Parallel Example: Phase 2

```bash
# Foundational tasks fan out in parallel once T004 (types.ts) lands:
Task: "Create chat-history.ts (T006)"               # depends on T004 only
Task: "Create chat-error-parsing.ts (T007)"         # independent
Task: "Create auto-scroll.ts (T005)"                # independent
Task: "Create markdown-content.tsx (T010)"          # depends on T001 only

# Tests can be authored alongside their implementations (parallel-safe within Phase 2):
Task: "Tests for chat-history.ts (T011)"            # depends on T004 + T006
Task: "Tests for chat-error-parsing.ts (T012)"      # depends on T007
Task: "Tests for chat-store.ts (T013)"              # depends on T009
Task: "Tests for markdown-content.tsx (T014)"       # depends on T010
```

## Parallel Example: User Story 1

```bash
# Verification first:
Task: "Streaming integration test (T015)"

# Then UI building blocks fan out:
Task: "Create chat-empty-state.tsx (T016)"
Task: "Create chat-message.tsx (T017)"
# Then the thread (T018) and the page client (T019) wire them together (sequential).
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 3)

1. Phase 1 — install `streamdown`, scaffold the route, wire the sidebar entry.
2. Phase 2 — the entire foundational layer: types, store, stream reducer, history serializer, error parser, auto-scroll, markdown wrapper, plus their unit tests.
3. Phase 3 — US1 streaming UI. Validate manually via the empty-state starter chips (Send/Stop UI ships in US3 but the chips already trigger `send()` via the store).
4. **STOP and VALIDATE**: walk through `quickstart.md` §1 against the running dev server; confirm streaming text + multi-turn + markdown render correctly.

### Incremental Delivery

- After Phase 3 → demo: streaming chat with markdown.
- After Phase 4 → demo: streaming chat with visible tool calls (the headline differentiator from "any chatbot").
- After Phase 5 → demo: full UX including Stop, Retry, every error path, char counter.
- After Phase 6 → done: Phase 3.5 of the AI Agent roadmap is complete; Phase 3.6 (history persistence) and Phase 3.7 (rich tool-call traces) plug into the structural slots this feature already exposes.

### Parallel Team Strategy

If two developers are available after Phase 2:

1. Developer A — Phase 3 (US1) end to end.
2. Developer B — Phase 4 (US2) component (T021) + test (T020) standalone, then merges into Developer A's `chat-message.tsx` once T017 lands.
3. Either developer — Phase 5 (US3) once Phase 3 lands (T028 needs `chat-page-client.tsx` to exist).

---

## Notes

- `[P]` tasks touch different files and have no in-phase dependency on each other.
- Tests are required by Constitution Principle IV — verification depth matches risk; the chat page is user-visible business logic.
- Verification tasks (T015, T020, T023) are listed before implementation tasks per the template's "verify tests fail before implementing" guidance. Implementation tasks may proceed once their tests are written and demonstrably failing.
- No raw SQL, no schema change, no new env var — Constitution Principles I, III, and V are all already satisfied by the design.
- Markdown rendering is delegated to `streamdown` with an explicit allowed-elements config; do NOT introduce a parallel renderer.
- The `useChat` React hook from `@ai-sdk/react` is intentionally NOT used — see `research.md` §1 for the rationale.
