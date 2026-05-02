# Phase 0 Research: Chat Streaming API with MCP Tool Calling

## Decision 1 — Stream protocol and response helper

- **Decision**: Use the Vercel AI SDK `streamText({ ... })` call and return its stream via `result.toUIMessageStreamResponse()` (the AI SDK v6 name for what v5 called `toDataStreamResponse()`). The response Content-Type is the AI SDK data-stream format (`text/event-stream` over HTTP) that `useChat` consumes natively.
- **Rationale**: FR-002 mandates the data-stream protocol (not raw text) because Phase 3.7 will render tool-call traces in the UI. The UI-message stream carries text deltas, tool-call start, tool-result, step-finish, and error events in one channel — which is exactly the event taxonomy required by FR-002, FR-009, FR-010, FR-011a, and the edge-case bullets for empty-response and cold-start.
- **Alternatives considered**:
  - `result.toTextStreamResponse()` — rejected: strips tool-call metadata the UI needs.
  - Bespoke SSE format — rejected: requires `useChat` to be reimplemented client-side and has no benefit.

## Decision 2 — MCP tool bridging into the AI SDK

- **Decision**: Build `buildMcpTools()` that calls `listMcpTools()` (Phase 3.2 singleton), iterates the returned tools, and for each one creates an AI SDK `tool({ description, parameters, execute })` where:
  - `parameters` is the tool's JSON Schema `inputSchema` converted to a Zod schema via a lightweight JSON-Schema→Zod conversion; if conversion fails for a given tool the loop falls back to `z.object({}).passthrough()` and logs a warning so a misbehaving tool does not block the whole chat route.
  - `execute(args)` calls `(await getMcpClient()).callTool({ name, arguments: args })` and returns the structured `content` array. If the MCP client rejects at call time (not at list time), the `execute` handler converts the rejection into the Phase 2.6 `{ error: { code, message } }` envelope and **returns** it rather than rethrowing, because FR-009 specifies the model must see the failure as a tool result, not as an endpoint-level error.
- **Rationale**: The AI SDK expects tools with Zod `parameters`; MCP publishes tools with JSON Schema `inputSchema`. Bridging once here keeps each call site clean. Returning errors from `execute` instead of throwing keeps tool-level failures inside the tool-call loop (so the model can recover) and reserves thrown errors for truly unrecoverable endpoint-level failures (like the MCP client itself being down — see Decision 4).
- **Alternatives considered**:
  - Hard-coding each tool's Zod schema in the web app — rejected: violates FR-003 (tool list must come live from the MCP client so new tools become available without web-app code changes).
  - Passing JSON Schema directly to the AI SDK — rejected: the AI SDK v6 `tool()` helper expects Zod and gets better TypeScript inference that way; adding a dep purely to accept raw JSON Schema is unjustified when a narrow converter works.

## Decision 3 — Step-budget option naming in AI SDK v6

- **Decision**: Use `streamText({ ..., stopWhen: stepCountIs(5) })` (AI SDK v6 API) to enforce the 5-step budget from FR-005/NFR-002. Detect exhaustion by checking `result.finishReason === "tool-calls"` (or an equivalent step-budget indicator) in the finish event and, when present, emit an explicit `step_budget_exceeded` error event on the data stream before closing (FR-010).
- **Rationale**: AI SDK v6 replaced v5's `maxSteps` number with the composable `stopWhen` + `stepCountIs()` pattern. The finish event exposes the stop reason, so we can translate "stopped due to step cap" into the documented `step_budget_exceeded` error code without counting steps ourselves.
- **Alternatives considered**:
  - Counting tool calls manually in an `onStepFinish` callback — rejected: duplicates what `stopWhen` already does and creates two sources of truth.
  - Relying on the model to stop itself — rejected: FR-005 explicitly requires enforcement even if the model asks for more.

## Decision 4 — Turn timeout, client disconnect, and abort wiring

- **Decision**: Create one `AbortController` per request (`const turnAbort = new AbortController()`) and wire three abort sources to its signal:
  1. `request.signal.addEventListener("abort", () => turnAbort.abort(new Error("client_disconnect")))` — satisfies FR-011.
  2. `const timer = setTimeout(() => turnAbort.abort(new Error("turn_timeout")), CHAT_TURN_TIMEOUT_MS)` — satisfies FR-011a. Cleared on normal finish.
  3. Pass `abortSignal: turnAbort.signal` into `streamText` so the provider request aborts on either trigger.
  On abort, the data-stream handler emits the appropriate error event (`turn_timeout` vs silent close for client_disconnect — no point writing to a closed socket) before the stream terminates.
- **Rationale**: Next.js 16 App Router exposes `request.signal` which fires when the client closes the connection. `streamText` accepts `abortSignal` and will propagate the abort through the provider SDK and into any in-flight tool `execute()` that itself honors abort. Sharing a single controller for both triggers means we write the unwind path once.
- **Alternatives considered**:
  - Two independent controllers — rejected: the merge logic is what `AbortController` already provides for free.
  - A wall-clock check inside `onStepFinish` — rejected: can't cut off a model token stream mid-generation, which is precisely what FR-011a requires.

## Decision 5 — Provider selection helper placement

- **Decision**: Create `apps/web/src/lib/ai/provider.ts` exporting `resolveChatProvider()` and `getChatModel()`. These functions mirror the worker's `aiExtractor.ts` logic (`AI_PROVIDER` env → `openai`/`anthropic`/`google`, default `openai`, model pulled from the corresponding `*_MODEL` env var, throw a named error when the model env is missing) but are **copied, not imported**, because the worker calls `generateObject` and the web calls `streamText` — the two call sites may diverge on retry, telemetry, and caching before any shared abstraction is stable.
- **Rationale**: Duplicating ~30 lines now is cheaper than premature shared-package extraction. When a third consumer appears (the Phase 5 Deal Analyzer), the shared abstraction can be extracted with three real call sites informing the API instead of two guessing.
- **Alternatives considered**:
  - Importing directly from `apps/worker` — rejected: violates monorepo boundary rules (Constitution Principle I).
  - Extracting to a new `packages/ai` package now — rejected: YAGNI; one extra consumer is not enough signal to freeze an interface.

## Decision 6 — Empty-tool-list degradation

- **Decision**: In `buildMcpTools()`, if `listMcpTools()` returns zero tools, return an empty tool map AND log `[chat] warning: MCP server published zero tools; serving text-only`. `streamText` is still called, but with an empty `tools` object so the model operates in plain-text mode. This satisfies the edge-case bullet "Empty tool list from MCP server".
- **Rationale**: Preserves chat availability when the MCP server is in a degraded state. The warning makes the degraded mode observable without paging.
- **Alternatives considered**:
  - Reject the request — rejected: too disruptive for a recoverable upstream hiccup.
  - Silently degrade — rejected: masks a real configuration problem.

## Decision 7 — Per-turn logging id

- **Decision**: Generate a per-turn id with `crypto.randomUUID()` at the top of the route handler. Every log line emitted during the turn includes `turnId` and, if present on the request body, `conversationId`. Use `console.log` / `console.error` with JSON-ish prefixes (`[chat]` + structured fields) for this phase; Phase 6.3 will replace with structured tracing.
- **Rationale**: FR-012 requires traceable log lines now, without committing to a full observability stack. `crypto.randomUUID()` is available natively in the Node runtime with no new dep.
- **Alternatives considered**:
  - Using `nanoid` — rejected: avoids adding a dep when `crypto.randomUUID()` already exists.
  - Skipping turn ids until Phase 6.3 — rejected: FR-012 is in scope for this phase.

## Open Items

None — all NEEDS CLARIFICATION items in the spec were resolved during the Session 2026-04-20 clarifications.
