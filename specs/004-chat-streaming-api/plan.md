# Implementation Plan: Chat Streaming API with MCP Tool Calling

**Branch**: `004-chat-streaming-api` | **Date**: 2026-04-20 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/004-chat-streaming-api/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/004-chat-streaming-api/spec.md)
**Input**: Feature specification from `/specs/004-chat-streaming-api/spec.md`

## Summary

Introduce a streaming chat API route at `POST /api/chat` inside `apps/web` that
bridges the Vercel AI SDK `useChat` data-stream protocol with the Phase 3.2 MCP
client singleton so the model can invoke real database-backed tools mid-stream.
The route resolves the active provider (OpenAI / Anthropic / Google) from the
same `AI_PROVIDER` + model env vars the worker already uses, validates the
incoming conversation (max 100 messages, 10,000 chars each, no client-supplied
system role), injects a server-side system prompt placeholder, exposes MCP tools
live via `listMcpTools()`, and calls `streamText` with a hard 5-step tool
budget and a 60-second per-turn timeout. Tool failures surface the Phase 2.6
`{ error: { code, message } }` payload back to the model without endpoint-side
retry; MCP connection loss, step exhaustion, provider errors, client
disconnects, empty model responses, and cold-start latency each produce a
distinguishable structured error event on the data stream. Implementation is
confined to `apps/web` with a small `lib/ai/` module that mirrors the worker's
provider-selection pattern without coupling the two.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16 (App Router), React 19, Node.js runtime
**Primary Dependencies**: Vercel AI SDK `ai@^6`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@modelcontextprotocol/sdk`, `zod@3.23`
**Storage**: None — conversation history is client-owned for this phase; no DB reads or writes from the chat route itself (MCP tools reach the DB via `packages/db`)
**Testing**: Vitest in `apps/web/` (existing `test` script), MSW-style mocks not required — provider SDKs and MCP client are stubbed with simple module mocks; route tests exercise the handler directly
**Target Platform**: Next.js 16 server running on Node.js 22 in Linux containers (local Docker + Coolify); Edge runtime is explicitly excluded because the MCP client spawns a child process over stdio
**Project Type**: Monorepo web application extension — new API route + small lib modules in `apps/web`
**Performance Goals**: First streamed chunk within 3s warm / 6s with one tool call / 15s cold boot (first request after process start); 5-step max tool loop; 60s hard per-turn timeout
**Constraints**: Unauthenticated endpoint (auth deferred to Phase 6.6); client-supplied history trusted fully; tool results passed through untruncated; no endpoint-side retry on tool errors; no new env vars required for happy path; singleton MCP client shared across concurrent turns
**Scale/Scope**: Single new POST route, one provider-resolution helper, one validation module, one tool-bridging helper, one route-handler test file; no schema changes, no queue changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass. All code lives in `apps/web` (route under `app/api/chat/` and helpers under `src/lib/ai/`). Reuses the existing `apps/web/src/lib/mcp/` singleton. No new package, no cross-app import, no new runtime.
- **Typed Maintainability**: Pass. Request body is parsed through a Zod schema that also documents the contract; provider selection, tool bridging, and stream helpers are each a small focused module. No regex-based parsing is introduced.
- **Data Safety**: Pass. The route performs no direct database access; any persistence happens downstream inside MCP tools that already use the Drizzle query builder in `packages/db`. No raw SQL, no schema change.
- **Verification Plan**: Pass. US1 (happy path + tool call) and US3 (error modes — MCP down, tool throws, malformed body, step overflow, turn timeout, empty response) get automated Vitest coverage against the route handler. US2 (provider abstraction) gets unit tests on the provider resolver plus a manual quickstart check against at least two providers.
- **Operational Readiness**: Pass. No new env vars are required for the baseline path. The web container already has `@ai-sdk/*` and `@modelcontextprotocol/sdk`. Structured logs carry a per-turn id and optional `conversationId`. Graceful shutdown reuses the existing `closeMcpClient` from Phase 3.2. Step budget and per-turn timeout are implemented as code constants with clearly named optional overrides (`CHAT_MAX_STEPS`, `CHAT_TURN_TIMEOUT_MS`) documented in quickstart.

## Project Structure

### Documentation (this feature)

```text
specs/004-chat-streaming-api/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (request / response / log shapes)
├── quickstart.md        # Phase 1 output (how to run & verify)
├── contracts/
│   └── chat-api.md      # HTTP + data-stream contract
├── checklists/
│   └── requirements.md  # (pre-existing)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/app/api/chat/
└── route.ts                      # POST /api/chat — Node runtime, streams data-stream protocol

apps/web/src/lib/ai/
├── provider.ts                   # resolveChatProvider() — reads AI_PROVIDER + model env vars
├── chat-config.ts                # CHAT_MAX_STEPS, CHAT_TURN_TIMEOUT_MS, CHAT_MAX_MESSAGES, CHAT_MAX_MESSAGE_CHARS, system prompt placeholder
├── chat-tools.ts                 # buildMcpTools() — lists MCP tools, wraps each as an AI SDK tool with Zod input and MCP callTool bridge
├── chat-validation.ts            # ChatRequestSchema (Zod) + normalizeMessages()
├── chat-errors.ts                # ChatErrorCode enum + emitChatError() helper for data-stream error events
└── chat-logger.ts                # per-turn id, structured log helpers for turn lifecycle, tool calls, validation rejects

apps/web/src/lib/mcp/
└── client.ts                     # (unchanged) singleton MCP client from Phase 3.2

apps/web/src/test/api/chat/
├── route.happy-path.test.ts      # US1 — text-only + single tool call + multi-step
├── route.errors.test.ts          # US3 — MCP unreachable, tool throws, malformed body, step overflow, timeout, empty response
├── provider.test.ts              # US2 — resolver unit tests (all providers, defaults, missing config)
├── chat-tools.test.ts            # MCP tool bridging: Zod schema inference, error envelope pass-through
└── chat-validation.test.ts       # 100-message cap, 10k char cap, system-role rejection, role allow-list
```

**Structure Decision**: Keep all new code inside `apps/web`. The route lives at the natural App Router path `app/api/chat/route.ts`. Feature-scoped helpers go under a new `src/lib/ai/` folder (sibling to the existing `src/lib/mcp/`) so Phase 3.4 (system prompt), Phase 3.5 (UI), and later AI features can extend the same module without retrofitting. No cross-workspace imports; the provider-resolution helper intentionally duplicates the worker's pattern rather than introducing a shared package, because the two consumers have different call shapes (`generateObject` vs `streamText`) and premature sharing would freeze the abstraction too early.

## Phases

### Phase 0: Research

- Confirm the AI SDK v6 data-stream API shape (`streamText` return type, `toDataStreamResponse()` vs `toUIMessageStreamResponse()`, step-budget option naming in v6, abort signal wiring) matches what Phase 3.5's `useChat` will consume.
- Confirm MCP SDK `client.callTool({ name, arguments })` response shape and how to turn it into an AI SDK `tool()` with a Zod `parameters` schema derived from `inputSchema` JSON Schema.
- Confirm the Next.js 16 App Router abort-signal behavior on client disconnect so FR-011 can be implemented by forwarding `request.signal` into `streamText`.
- Document the chosen step-budget option and timeout approach (AI SDK v6 `stopWhen` / `maxSteps` naming) with a rationale and alternatives.

**Output**: `research.md` with the four decisions above.

### Phase 1: Design & Contracts

- `data-model.md`: Chat Turn Request (Zod schema), Chat Turn Response Stream events (text-delta, tool-call, tool-result, error, finish), Tool Invocation Event (log shape), Provider Selection (resolved shape).
- `contracts/chat-api.md`: HTTP method, path, headers, request JSON schema, data-stream event taxonomy, error-event taxonomy with codes (`validation_error`, `mcp_unreachable`, `provider_config_missing`, `provider_error`, `step_budget_exceeded`, `turn_timeout`, `empty_response`, `tool_list_empty_warning`), status codes for pre-stream vs in-stream errors.
- `quickstart.md`: local setup (env vars already present), curl recipe against the route, expected output markers (tool-call event + final text), cold-start caveat, provider-switch recipe.
- Run `.specify/scripts/bash/update-agent-context.sh claude` to register the new module paths in agent context.

**Output**: `data-model.md`, `contracts/chat-api.md`, `quickstart.md`, updated agent context file.

### Phase 2: Planning handoff

- `/speckit.tasks` will translate the contracts and module layout into an actionable, user-story-grouped task list. This plan does not enumerate tasks.

## Story Verification

- **US1 Streamed, data-grounded answer**: Automated route-handler tests assert (a) text-delta events appear on the stream, (b) a tool-call event for `search_products` is emitted when the prompt requires it, (c) the final text includes the mocked tool result, (d) multi-step (two sequential tool calls) works within the 5-step budget. Manual check: curl the route against a warm dev server with a real MCP subprocess and confirm a grounded answer.
- **US2 Provider abstraction**: Unit tests on `resolveChatProvider()` cover all three provider values, default-to-openai behavior on unset/unknown, and the explicit error when the required model env var is missing. Manual check: start the web app with `AI_PROVIDER=anthropic` then `AI_PROVIDER=google` and verify the same prompt streams successfully.
- **US3 Error handling**: Automated tests induce each failure mode via module mocks — MCP connection failure (`getMcpClient` rejects), tool throws (mocked MCP `callTool` rejects), malformed body (missing `messages`), oversized history, client-supplied system role, step-budget overflow (loop forces >5 tool calls), turn timeout (force slow tool), empty model response — and assert each produces a recognizable error event with the documented code.

## Technical Constraints

- Route MUST declare `export const runtime = "nodejs"` because the MCP client relies on stdio subprocess.
- Route MUST forward `request.signal` into `streamText` so a client disconnect aborts the model request and in-flight tool calls (FR-011).
- Route MUST wrap the turn in an `AbortController` that also fires on the 60-second turn-timeout (FR-011a) so both paths share one abort signal.
- Request body MUST be parsed through a single Zod schema; no ad hoc checks — consistent with the Typed Maintainability principle.
- Tool results from the MCP client MUST be forwarded to the model untouched; no truncation, no JSON reshaping (FR-004).
- Every log line produced by the route MUST carry a server-generated per-turn id; when the caller sends `conversationId`, it MUST appear alongside (FR-012).
- No secrets (API keys, stack traces, or internal paths) MUST appear in any client-facing error payload (NFR-003).

## Complexity Tracking

> No violations. All work fits inside `apps/web` and reuses existing dependencies. No Complexity Tracking entries.
