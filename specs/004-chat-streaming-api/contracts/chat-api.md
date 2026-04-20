# HTTP Contract: `POST /api/chat`

**Runtime**: Node.js (not Edge). The route spawns a child process over stdio via the MCP client.
**Auth**: None in this phase (deferred to Phase 6.6).
**Concurrency**: Safe; the MCP client is a singleton multiplexed across requests (FR-013).

> **Terminology**: "Data-stream protocol" (used in `spec.md`) and "AI SDK v6 UI-message stream" (used in `plan.md` / `research.md`) refer to the same wire format — the event taxonomy consumed natively by the AI SDK's `useChat` hook and emitted by `streamText().toUIMessageStreamResponse()`.

## Request

**Method**: `POST`
**Path**: `/api/chat`
**Headers**: `Content-Type: application/json`
**Body** (JSON):

```jsonc
{
  "messages": [
    { "role": "user", "content": "what products do I track?" }
    // ...additional prior messages of role user | assistant | tool, max 100 total
  ],
  "conversationId": "optional-free-form-string-<=-200-chars"
}
```

**Body validation** (enforced by `ChatRequestSchema`, see `data-model.md §1`):

- `messages`: array, length 1..100.
- Each `messages[i].role`: one of `"user" | "assistant" | "tool"`. A `"system"` role is rejected with `system_role_forbidden` (FR-008a).
- Each `messages[i].content`: string, length 1..10000 (FR-008).
- `conversationId`: optional string, ≤ 200 chars.
- Extra top-level fields are ignored, except a `system` field which is treated the same as a system-role message and rejected.

## Pre-stream error responses

Returned as regular JSON (not data stream) when the turn cannot start.

| Status | `code` | Cause |
|---|---|---|
| 400 | `validation_error` | Any rule in `ChatRequestSchema` fails. Body: `{ "error": { "code": "validation_error", "message": "<specific reason>" } }`. |
| 500 | `provider_config_missing` | The resolved provider's model env var is unset (FR-007). |
| 502 | `mcp_unreachable` | `getMcpClient()` rejects before streaming starts (FR-009, MCP connection broken). |

No stack traces, absolute paths, or API keys ever appear in these payloads (NFR-003).

## Success response

- **Status**: `200`
- **Headers**: `Content-Type: text/event-stream; charset=utf-8` (AI SDK v6 UI-message stream)
- **Body**: The AI SDK data-stream protocol consumed natively by `useChat` on the client (Phase 3.5). Events observable on the wire:

| Event | Meaning |
|---|---|
| `text-delta` | Incremental text token from the model |
| `tool-call` | Model is invoking a tool (name + args) |
| `tool-result` | Tool finished; payload is the MCP tool's raw result (or the Phase 2.6 `{ error: { code, message } }` envelope on tool failure — no endpoint-side retry; FR-009) |
| `step-finish` | A tool-calling step completed |
| `error` | Terminal in-stream failure with a `ChatErrorCode` code (see below) |
| `finish` | Turn completed normally |

## In-stream error event codes

Emitted as an `error` event on the data stream (not as an HTTP error) and followed by stream termination.

| `code` | Cause | Spec ref |
|---|---|---|
| `provider_error` | AI provider rate-limited / auth-failed / errored mid-stream | US3 scenario 5 |
| `step_budget_exceeded` | Model exceeded the 5-step tool-call budget without a final answer | FR-010 |
| `turn_timeout` | 60-second per-turn wall-clock timer fired | FR-011a |
| `empty_response` | Model finished with no text and no tool call | spec edge case |

On **client disconnect** (FR-011), the server aborts model + tool work and closes the stream **without** emitting an `error` event — the socket is already gone.

## Behavior guarantees

- **Streaming begins within 3s** on a warm request with no tool call (SC-002).
- **Streaming begins within 6s** on a warm request that triggers one tool call (SC-002).
- **Streaming begins within 15s** on the first request after process start (cold MCP subprocess) (SC-002).
- **At most 5 tool-calling steps** per turn (FR-005).
- **At most 60 seconds** from request receipt to final event (FR-011a).
- **Tool results are never truncated** by the endpoint (FR-004). Individual MCP tools are responsible for self-limiting via their own input schemas.
- **Tool failures are passed to the model** as tool results without endpoint-side retry (FR-009). Only the MCP connection itself being broken terminates the turn.
- **Zero MCP tools** degrades to text-only chat with a server log warning (spec edge case).
- **Provider defaults to OpenAI** when `AI_PROVIDER` is unset or unrecognized (FR-006).
- **System messages from the client** are always rejected; the server injects its own system prompt (FR-008a).

## Logging contract (server-side)

Every log line produced during a turn carries:

- `turnId` — server-generated `crypto.randomUUID()` at request entry (FR-012)
- `conversationId` — echoed from the request if present (FR-012)

Log lines are produced for: turn received, tool-call start/end (with duration + outcome), provider error, validation rejection, step budget exceeded, turn timeout, empty response, and MCP tool-list empty warning.

## Out of scope for this contract

- Authentication / rate limiting — Phase 6.6.
- Server-side conversation persistence — Phase 3.6.
- Tool-call UI trace rendering — Phase 3.7 (consumes the already-emitted `tool-call` / `tool-result` events; no API change).
- System-prompt domain restriction content — Phase 3.4 (replaces the placeholder `CHAT_SYSTEM_PROMPT` without API change).
