# Phase 1 Data Model: Chat Streaming API

This feature introduces no database schema changes. The "data model" below
describes the in-memory / on-the-wire shapes the route consumes and produces.

## 1. Chat Turn Request

Parsed by a single Zod schema (`ChatRequestSchema` in `apps/web/src/lib/ai/chat-validation.ts`).

```ts
ChatMessage = {
  role: "user" | "assistant" | "tool";   // "system" is rejected (FR-008a)
  content: string;                        // 1..10_000 chars (FR-008)
  // Optional AI SDK passthrough fields for assistant / tool messages:
  toolCallId?: string;                    // present on tool-result messages
  toolName?: string;                      // present on tool-result messages
  // Any other AI SDK UIMessage fields are accepted via .passthrough() at the
  // top level of the message schema so future AI SDK additions do not break
  // the validator, but unknown roles are always rejected.
}

ChatRequest = {
  messages: ChatMessage[];                // 1..100 items (FR-008)
  conversationId?: string;                // optional, free-form, any length <= 200 chars, echoed in logs only
  // No other top-level fields are accepted; a client-supplied `system` field
  // or a `role: "system"` message in `messages` causes a 400.
}
```

**Validation rules**

| Rule | Source | Error code |
|---|---|---|
| `messages` is a non-empty array of size ≤ 100 | FR-008 | `validation_error` (too_many_messages / empty) |
| Each `role` ∈ {user, assistant, tool} | FR-008, FR-008a | `validation_error` (invalid_role) |
| Each `content` is a string of length 1..10000 | FR-008 | `validation_error` (content_too_long / content_empty) |
| No message has `role === "system"` | FR-008a | `validation_error` (system_role_forbidden) |
| `conversationId`, if present, is a string ≤ 200 chars | spec Clarifications | `validation_error` (conversation_id_invalid) |

Validation failures produce a pre-stream HTTP 400 JSON response — they never open a data stream.

## 2. Chat Turn Response Stream

The handler returns the AI SDK v6 UI-message stream. The event taxonomy below is what the UI will observe on the wire (names follow the AI SDK data-stream protocol; clients using `useChat` do not parse these manually).

| Event | When | Payload |
|---|---|---|
| `text-delta` | Model emits a text token | Incremental string |
| `tool-call` | Model requests a tool | `{ toolCallId, toolName, args }` |
| `tool-result` | Tool execution returns (success or structured error) | `{ toolCallId, result }` — `result` is the MCP tool's raw content, untruncated (FR-004) |
| `step-finish` | Each tool-calling step completes | `{ finishReason, usage }` |
| `error` | Any terminal failure emitted in-stream | `{ code: ChatErrorCode, message: string }` — never contains API keys, stack traces, or absolute paths (NFR-003) |
| `finish` | Turn completes normally | `{ finishReason: "stop" | "tool-calls" | ... }` |

### 2.1 ChatErrorCode (documented error taxonomy)

Defined in `apps/web/src/lib/ai/chat-errors.ts`.

| Code | Trigger | Surface |
|---|---|---|
| `validation_error` | Request body fails `ChatRequestSchema` | Pre-stream HTTP 400 JSON — not an in-stream event |
| `provider_config_missing` | Selected `AI_PROVIDER`'s model env var is missing | Pre-stream HTTP 500 JSON (FR-007) |
| `mcp_unreachable` | `getMcpClient()` rejects at turn start (cannot connect to MCP subprocess) | Pre-stream HTTP 502 JSON (FR-009 — only when the MCP connection itself is broken) |
| `provider_error` | AI provider rate-limits / auths / errors mid-stream | In-stream `error` event (FR-009 edge case + US3 scenario 5) |
| `step_budget_exceeded` | `stopWhen: stepCountIs(5)` fires before a final answer | In-stream `error` event (FR-010) |
| `turn_timeout` | 60 s wall-clock timer fires | In-stream `error` event (FR-011a) |
| `empty_response` | Model finishes a turn with no text and no tool call | In-stream `error` event (spec edge case — "Empty model response") |

Additionally, `buildMcpTools()` emits a `tool_list_empty_warning` **log line** (not a stream event) when the MCP server publishes zero tools — the turn proceeds as text-only chat (spec edge case — "Empty tool list from MCP server").

## 3. Tool Invocation Event (log shape)

Emitted from `chat-tools.ts` `execute` wrapper for every tool call, one log line each at call start and call end.

```ts
ToolInvocationLog = {
  turnId: string;                 // server-generated per-turn id (FR-012)
  conversationId?: string;        // echoed from request if present
  toolName: string;
  phase: "start" | "end";
  durationMs?: number;            // present on "end"
  outcome?: "success" | "error";  // present on "end"
  errorCode?: string;             // present on "end" when outcome === "error"
}
```

Individual tool failures flow into the stream as a `tool-result` event whose payload is the Phase 2.6 `{ error: { code, message } }` envelope — not as an `error` event — so the model can recover (FR-009).

## 4. Provider Selection

Resolved per request by `resolveChatProvider()` in `apps/web/src/lib/ai/provider.ts`.

```ts
ChatProvider = "openai" | "anthropic" | "google";

ResolvedProvider = {
  provider: ChatProvider;         // from AI_PROVIDER env; defaults to "openai"
  model: string;                  // from OPENAI_MODEL | ANTHROPIC_MODEL | GOOGLE_MODEL
}
```

**Rules**

- `AI_PROVIDER` unset or unknown → defaults to `"openai"` (FR-006).
- Corresponding `*_MODEL` env var missing → throws `ChatProviderConfigError` which the route translates to a `provider_config_missing` pre-stream 500 (FR-007).

## 5. Configuration Constants

Defined in `apps/web/src/lib/ai/chat-config.ts`, all overridable via env:

| Constant | Default | Env override | Source |
|---|---|---|---|
| `CHAT_MAX_MESSAGES` | `100` | — | FR-008 |
| `CHAT_MAX_MESSAGE_CHARS` | `10000` | — | FR-008 |
| `CHAT_MAX_STEPS` | `5` | `CHAT_MAX_STEPS` | FR-005 / NFR-002 |
| `CHAT_TURN_TIMEOUT_MS` | `60_000` | `CHAT_TURN_TIMEOUT_MS` | FR-011a |
| `CHAT_CONVERSATION_ID_MAX` | `200` | — | spec Clarifications |
| `CHAT_SYSTEM_PROMPT` | placeholder text ("You are a helpful assistant for a price-monitoring application.") | — | Phase 3.4 will replace with real domain-restricted prompt |
