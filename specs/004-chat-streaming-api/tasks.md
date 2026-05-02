---

description: "Tasks for Chat Streaming API with MCP Tool Calling"
---

# Tasks: Chat Streaming API with MCP Tool Calling

**Input**: Design documents from `/specs/004-chat-streaming-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-api.md, quickstart.md

**Tests**: Automated Vitest coverage is required for US1 (happy path + tool-calling) and US3 (error taxonomy) per the Verification Plan in plan.md. US2 has unit-level coverage for the provider resolver plus a manual quickstart check.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

All paths are relative to the repo root `/home/onlineeric/repos/price-monitoring-agent/`. This feature is confined to `apps/web` (App Router route + `src/lib/ai/` helpers + `src/test/api/chat/` suites).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the empty module skeleton so later story phases can land code in parallel without merge conflicts.

- [x] T001 Create the new library directory `apps/web/src/lib/ai/` with an empty `index.ts` barrel file.
- [x] T002 [P] Create the new test directory `apps/web/src/test/api/chat/` (add a `.gitkeep` if no files land in this phase).
- [x] T003 [P] Create the new route directory `apps/web/src/app/api/chat/` (empty; `route.ts` is added in US1).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-story scaffolding that US1, US2, and US3 all depend on. No user story work can begin until these land.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Define configuration constants (`CHAT_MAX_MESSAGES=100`, `CHAT_MAX_MESSAGE_CHARS=10000`, `CHAT_MAX_STEPS=5`, `CHAT_TURN_TIMEOUT_MS=60_000`, `CHAT_CONVERSATION_ID_MAX=200`, `CHAT_SYSTEM_PROMPT` placeholder) with optional env overrides for `CHAT_MAX_STEPS` and `CHAT_TURN_TIMEOUT_MS` in `apps/web/src/lib/ai/chat-config.ts`.
- [x] T005 [P] Define the `ChatErrorCode` union (`validation_error`, `provider_config_missing`, `mcp_unreachable`, `provider_error`, `step_budget_exceeded`, `turn_timeout`, `empty_response`) plus helper types and an `emitChatError()` helper that writes a data-stream `error` event in `apps/web/src/lib/ai/chat-errors.ts`.
- [x] T006 [P] Implement the per-turn logger in `apps/web/src/lib/ai/chat-logger.ts`: factory that accepts `turnId` + optional `conversationId` and exposes `turnReceived`, `toolCallStart`, `toolCallEnd`, `providerError`, `validationRejected`, `budgetExceeded`, `turnTimeout`, `emptyResponse`, `mcpToolListEmpty` methods — all emit a single `console.log` / `console.error` line prefixed `[chat]` with structured fields.
- [x] T007 Export the new modules from `apps/web/src/lib/ai/index.ts` so the route handler imports from a single entrypoint.

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Ask a question and receive a streamed, data-grounded answer (Priority: P1) 🎯 MVP

**Goal**: Ship `POST /api/chat` end-to-end: accepts a validated conversation, resolves the active provider, bridges the MCP tool list into `streamText`, streams the AI SDK data-stream protocol back with up to 5 tool-calling steps, and hands a grounded answer to the caller.

**Independent Test**: From `quickstart.md`, send both curl recipes (text-only question and `search_products`-triggering question) against a warm `pnpm --filter @price-monitor/web dev` server and observe (a) incremental `text-delta` events and (b) a `tool-call` + `tool-result` pair with real DB rows before the final answer.

### Verification for User Story 1 ⚠️

- [x] T008 [P] [US1] Write route-handler integration test `apps/web/src/test/api/chat/route.happy-path.test.ts` covering: (a) text-only request produces `text-delta` + `finish` events, (b) `search_products`-triggering request produces a `tool-call` followed by `tool-result` with mocked MCP payload, (c) two-step tool call succeeds within the 5-step budget, (d) `conversationId` is echoed into log lines, (e) an empty MCP tool result (e.g. `[]` rows) is passed through untruncated and the model still produces a coherent `text-delta` stream. Mock `@/lib/mcp` (`getMcpClient`, `listMcpTools`) and the AI SDK provider functions via `vi.mock`.
- [x] T009 [P] [US1] Write MCP tool-bridging test `apps/web/src/test/api/chat/chat-tools.test.ts` asserting: (a) each MCP tool yields an AI SDK `tool({ description, parameters, execute })`, (b) `execute` returns the MCP `callTool` result untruncated, (c) unparseable JSON-Schema `inputSchema` falls back to `z.object({}).passthrough()` and logs a warning without throwing.
- [x] T010 [P] [US1] Write request-validation test `apps/web/src/test/api/chat/chat-validation.test.ts` asserting the schema accepts 1–100 messages of role `user`/`assistant`/`tool` with content 1–10000 chars, rejects role `system` and client-supplied top-level `system`, rejects empty messages array, and accepts / rejects `conversationId` at the 200-char boundary.

### Implementation for User Story 1

- [x] T011 [P] [US1] Implement `ChatRequestSchema` (Zod) and `normalizeMessages()` in `apps/web/src/lib/ai/chat-validation.ts` per `data-model.md §1`. Produces a typed `ChatRequest` and surfaces rule-specific error detail strings.
- [x] T012 [US1] Implement `buildMcpTools()` in `apps/web/src/lib/ai/chat-tools.ts`: calls `listMcpTools()`, converts each tool's JSON-Schema `inputSchema` to a Zod parameters schema (fallback `z.object({}).passthrough()` with warning log on conversion failure), wraps each `execute` to call `(await getMcpClient()).callTool({ name, arguments })`, converts thrown MCP failures into the Phase 2.6 `{ error: { code, message } }` envelope as the returned tool result, and logs tool-call start/end through the logger factory.
- [x] T013 [US1] Implement `POST /api/chat` route handler in `apps/web/src/app/api/chat/route.ts` with `export const runtime = "nodejs"`. Sequence: generate `turnId` with `crypto.randomUUID()`, parse body with `ChatRequestSchema`, resolve provider/model, call `buildMcpTools()`, invoke `streamText({ model, messages, system: CHAT_SYSTEM_PROMPT, tools, stopWhen: stepCountIs(CHAT_MAX_STEPS), abortSignal: turnAbort.signal })`, return `result.toUIMessageStreamResponse()`. Includes the `AbortController` wiring for client disconnect + turn timeout (deferred detail in T022).
- [x] T014 [US1] Document the new route in `apps/web/src/app/api/` routing docstring comments if present; otherwise add a brief header comment at the top of `route.ts` describing the contract, runtime, and linked spec.

**Checkpoint**: US1 is fully functional and testable independently — curl recipes from `quickstart.md` succeed end-to-end.

---

## Phase 4: User Story 2 — Provider-agnostic chat via `AI_PROVIDER` (Priority: P1)

**Goal**: Chat route resolves OpenAI / Anthropic / Google dynamically from the same env convention the worker uses, defaulting to OpenAI when unset/unknown and failing fast on missing model env.

**Independent Test**: Restart the web app with `AI_PROVIDER=anthropic` then `AI_PROVIDER=google`, repeat the US1 tool-calling curl, observe a grounded answer each time. Unset `OPENAI_MODEL` with `AI_PROVIDER=openai` and confirm the route returns HTTP 500 `provider_config_missing` instead of hanging.

### Verification for User Story 2 ⚠️

- [x] T015 [P] [US2] Write `apps/web/src/test/api/chat/provider.test.ts` covering: (a) `AI_PROVIDER=openai`/`anthropic`/`google` returns the matching `ChatProvider` plus the matching `*_MODEL`, (b) unset / unknown `AI_PROVIDER` defaults to `openai`, (c) missing `*_MODEL` for the resolved provider throws a named `ChatProviderConfigError`.

### Implementation for User Story 2

- [x] T016 [P] [US2] Implement `resolveChatProvider()`, `getChatModel()`, and the `ChatProviderConfigError` class in `apps/web/src/lib/ai/provider.ts`. Logic mirrors `apps/worker/src/services/aiExtractor.ts` provider/model resolution but is duplicated (not imported) per research Decision 5.
- [x] T017 [US2] Wire the resolver into `route.ts` (T013): call `resolveChatProvider()` + `getChatModel()` at turn start; catch `ChatProviderConfigError` and emit a pre-stream HTTP 500 JSON response with `code: "provider_config_missing"` before any streaming begins.

**Checkpoint**: US1 + US2 both pass — the same route serves grounded answers under all three providers with no code changes.

---

## Phase 5: User Story 3 — Robust error handling keeps the conversation usable (Priority: P2)

**Goal**: Each failure mode (MCP unreachable, tool throws, malformed/oversized body, step-budget overflow, 60-second turn timeout, provider mid-stream error, empty model response, client disconnect, zero MCP tools) produces a distinguishable response the UI can recognize, plus a log line sufficient to diagnose, without hanging or crashing the server.

**Independent Test**: Execute the error-mode matrix in `quickstart.md` (induce each failure, verify HTTP status or in-stream `error` event code, verify server log lines). Automated suite exercises each via module mocks.

### Verification for User Story 3 ⚠️

- [x] T018 [P] [US3] Write `apps/web/src/test/api/chat/route.errors.test.ts` covering one test per error mode: `validation_error` (missing `messages`, system role, >100 messages, >10k-char content), `provider_config_missing` (mock resolver to throw), `mcp_unreachable` (mock `getMcpClient` to reject), tool-throws produces Phase 2.6 envelope as `tool-result` (model continues), `step_budget_exceeded` (force 6+ tool calls), `turn_timeout` (mock slow tool + tight `CHAT_TURN_TIMEOUT_MS`), `empty_response` (mock provider to finish with no text and no tool call), client-disconnect via aborted `Request.signal` terminates cleanly without an `error` event, empty MCP tool list logs warning and still streams text. Additionally assert for each **pre-stream** error body (HTTP 400 / 500 / 502) that the JSON envelope matches exactly `{ "error": { "code": string, "message": string } }` and contains no `stack`, no absolute filesystem path, and no substring that matches a configured API-key env var — satisfying NFR-003 for pre-stream errors.

### Implementation for User Story 3

- [x] T019 [US3] Wrap `buildMcpTools()` entrypoint in `route.ts` (T013) so `getMcpClient()` rejections at turn start are caught and converted into a pre-stream HTTP 502 JSON `{ code: "mcp_unreachable" }`. Confirm later in-flight `callTool()` rejections stay inside the tool wrapper (return as Phase 2.6 envelope) and do NOT bubble up to this handler.
- [x] T020 [US3] In `chat-tools.ts` (T012), emit the `mcpToolListEmpty` warning log and pass an empty `tools` object to `streamText` when `listMcpTools()` returns zero items — the turn still serves as text-only chat.
- [x] T021 [US3] In `route.ts` (T013), detect `finishReason === "tool-calls"` (or the v6 equivalent step-cap indicator) on the finish event; when it fires, emit a `step_budget_exceeded` in-stream `error` event before closing the stream, and log via `budgetExceeded`.
- [x] T022 [US3] In `route.ts` (T013), implement the shared `turnAbort` `AbortController`: (a) wire `request.signal` → `turnAbort.abort("client_disconnect")`, (b) start a `setTimeout(() => turnAbort.abort("turn_timeout"), CHAT_TURN_TIMEOUT_MS)` and clear it on normal finish, (c) pass `turnAbort.signal` to `streamText`, (d) on timeout abort emit a `turn_timeout` in-stream `error` event, (e) on client disconnect skip the error event (socket is gone) but still release resources and log the abort.
- [x] T023 [US3] In `route.ts` (T013), handle mid-stream provider exceptions (AI SDK v6 `onError`/`result.error`) by emitting a `provider_error` in-stream `error` event with a scrubbed message (no API keys, no stack traces, no absolute paths — NFR-003) and log via `providerError`.
- [x] T024 [US3] In `route.ts` (T013), detect the empty-response case (finish event with no text deltas and no tool calls during the turn) and emit an `empty_response` in-stream `error` event before closing.
- [x] T024a [US3] Write `apps/web/src/test/api/chat/route.concurrency.test.ts` that drives two overlapping chat turns simultaneously against the handler with a mocked MCP client whose `callTool` resolves on a delay. Assert each turn sees only its own `toolCallId` + `turnId` in log lines and receives the correct tool-result payload — satisfying FR-013 (concurrent safety over the singleton MCP stdio connection).

**Checkpoint**: All three user stories pass independently; the error matrix from `quickstart.md` is fully covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, doc alignment, and observability touch-ups that span stories.

- [x] T025 [P] Add or verify JSDoc on each exported symbol in `apps/web/src/lib/ai/` — function purpose, argument shape, and link back to the spec's FR/NFR for non-obvious constraints.
- [x] T026 [P] Add a one-line comment at the top of `apps/web/src/app/api/chat/route.ts` pointing to `specs/004-chat-streaming-api/contracts/chat-api.md` for the contract.
- [x] T027 Run `pnpm --filter @price-monitor/web test` and confirm all five new test files pass.
- [x] T028 Run `pnpm --filter @price-monitor/web lint` and fix any Biome violations in new files only.
- [ ] T029 Manually execute every recipe in `specs/004-chat-streaming-api/quickstart.md` (happy path, tool-calling path, provider switch for at least two of three providers, each error-mode smoke check) and record pass/fail notes in the feature PR description.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — blocks all user story phases.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational. US2 integrates at T017 by modifying the route introduced in T013 (US1), so coordinate when both stories are worked in parallel (merge T013 before T017, or land both in one PR).
- **User Story 3 (Phase 5)**: Depends on Foundational. T019–T024 modify the route introduced in T013 (US1). Same coordination note as US2.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### Within Each User Story

- Verification tasks ([P]-marked test files) are defined before implementation and should fail before implementation lands.
- In US1, `buildMcpTools()` (T012) depends on `ChatRequestSchema` (T011) only for type imports; it can be built in parallel if the types are declared first.
- The route handler (T013) depends on T011, T012, T016 (provider resolver) and is the single file all three stories touch.

### Parallel Opportunities

- Phase 1 tasks T002 and T003 run in parallel (different directories).
- Phase 2 tasks T005 and T006 run in parallel (different files). T004 must land first because T005 and T006 import from it.
- Within US1, T008/T009/T010 (three independent test files) run fully in parallel, and T011 runs in parallel with T008/T009/T010.
- Across stories, after T013 lands, T015/T016 (US2) and T018 (US3) can be drafted in parallel branches.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, kick off US1 tests + schema file in parallel:
Task: "Write route-handler integration test apps/web/src/test/api/chat/route.happy-path.test.ts"
Task: "Write MCP tool-bridging test apps/web/src/test/api/chat/chat-tools.test.ts"
Task: "Write request-validation test apps/web/src/test/api/chat/chat-validation.test.ts"
Task: "Implement ChatRequestSchema in apps/web/src/lib/ai/chat-validation.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) — creates the module skeleton.
2. Complete Phase 2 (Foundational) — config, error codes, logger, barrel export.
3. Complete Phase 3 (US1) — route, validation, tool bridge, happy-path tests.
4. **STOP and VALIDATE**: Run the US1 curl recipes from `quickstart.md` and the new `route.happy-path.test.ts`, `chat-tools.test.ts`, `chat-validation.test.ts` suites.
5. Demo the MVP: text-only answer + one tool-calling answer on the active provider.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test independently → MVP demo (warm streaming + tool call on default provider).
3. US2 → verify provider switch across OpenAI/Anthropic/Google.
4. US3 → verify the full error matrix; Phase 3.5 UI can now build against a stable contract.
5. Polish → run quickstart + tests + lint + manual verification matrix.

### Parallel Team Strategy

- One developer can reasonably ship all four phases sequentially in under two days.
- With two developers, Developer A owns Setup + Foundational + US1; Developer B drafts US2 and US3 test files in parallel and merges after US1 lands so the shared `route.ts` does not conflict.

---

## Notes

- [P] tasks = different files, no ordering dependency.
- [Story] label maps each task to a user story for traceability against the spec.
- No DB or queue changes in this feature — the MCP tools already cover the persistence boundary.
- Tool results are passed to the model untruncated (FR-004); do not introduce any size cap in the endpoint.
- No endpoint-side retry on tool errors (FR-009); only MCP connection loss terminates the turn.
- All log lines must carry `turnId`; `conversationId` is echoed only when the request supplies it.
- Commit after each task or logical group; stop at each Checkpoint to validate the story independently.
