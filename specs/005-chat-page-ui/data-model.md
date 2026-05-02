# Data Model — Phase 1: Dashboard Chat Page (Streaming UI)

This file defines the **client-side** data shapes for the chat page.
There are no database tables, no queue payloads, and no new server
contracts here — those live in spec 004. Everything below is a
TypeScript shape held in the per-tab Zustand store.

The shapes intentionally mirror the spec's Key Entities section
(`ConversationSession`, `DisplayedMessage`, `ToolCallEvent`,
`ChatError`) so reviewers can read the spec and the code side by
side.

---

## 1. Conversation status

```ts
export type ConversationStatus = "idle" | "streaming" | "errored";
```

State machine:

```
       send()
idle  ───────────►  streaming  ───────────►  idle      (turn finished cleanly)
                       │
                       ├──────► errored                (terminal error event or pre-stream error)
                       │
                       └──────► idle                   (Stop pressed — turn marked stopped, status returns to idle)
```

- `errored` is **only** reached when a turn cannot continue.
  Per-tool failures inside an otherwise-fine turn keep status at
  `streaming` until the model finishes the turn (per FR-006:
  failed tools do not abort the turn).
- `errored` can be cleared by `retry()` (transitions back to
  `streaming`), `reset()` (back to `idle`), or `send()` of a new
  message (back to `streaming`).

---

## 2. Displayed message

```ts
export type MessageRole = "user" | "assistant";

export type AssistantMessageState =
  | "streaming"   // still receiving deltas
  | "complete"    // finished cleanly
  | "stopped"     // user pressed Stop mid-stream
  | "errored";    // turn ended with a ChatError

export interface UserMessage {
  id: string;                  // crypto.randomUUID(), stable for React keys
  role: "user";
  text: string;                // plain text, never rendered as Markdown (see plan: Technical Constraints)
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;                // grows as text-delta parts arrive; rendered as Markdown
  toolEvents: ToolCallEvent[]; // ordered as they arrived in the stream
  state: AssistantMessageState;
  error?: ChatError;           // present iff state === "errored"
}

export type DisplayedMessage = UserMessage | AssistantMessage;
```

**Why a discriminated union** (not a single shape with optional
fields): the `role` discriminant makes it impossible to construct a
"user message with toolEvents" or "assistant message without text"
by mistake. Components branch on `role` once and TypeScript narrows
the rest.

---

## 3. Tool-call event

```ts
export type ToolStatus =
  | "running"      // tool-call event observed; tool-result not yet
  | "completed"    // tool-result observed, no error envelope
  | "failed"       // tool-result observed with { error: { code, message } }
  | "stopped";     // user pressed Stop while running (FR-008)

export interface ToolCallEvent {
  id: string;            // toolCallId from the v6 stream part — uniquely identifies the call
  toolName: string;      // e.g. "search_products"
  status: ToolStatus;
  // Phase 3.7 expansion slot — populated when tool-call event arrives,
  // updated when tool-result arrives. Kept as `unknown` for now because
  // the indicator only needs name+status; richer rendering belongs to 3.7.
  args?: unknown;
  result?: unknown;
  // When status === "failed", carries the structured tool error envelope
  // (Phase 2.6 shape) the model received as the tool result.
  errorEnvelope?: { code: string; message: string };
}
```

State transitions, per spec FR-006/FR-008:

```
running  ──── tool-result without error ────►  completed
running  ──── tool-result with error ──────►  failed
running  ──── user clicks Stop ────────────►  stopped
```

`completed` / `failed` / `stopped` are terminal.

---

## 4. Chat error

```ts
// Mirrors the seven codes in apps/web/src/lib/ai/chat-errors.ts
export type ChatErrorCode =
  | "validation_error"
  | "provider_config_missing"
  | "mcp_unreachable"
  | "provider_error"
  | "step_budget_exceeded"
  | "turn_timeout"
  | "empty_response";

export interface ChatError {
  code: ChatErrorCode;
  message: string;       // already scrubbed by the API (NFR-005)
  surface: "pre-stream" | "in-stream";
}

// Derived helper (pure function in chat-error-parsing.ts):
export function isRetryable(code: ChatErrorCode): boolean {
  // FR-009: retry is offered for transient/server-side conditions only.
  // Validation and provider-config require user/operator action — retrying
  // the identical request will fail identically.
  switch (code) {
    case "validation_error":
    case "provider_config_missing":
      return false;
    case "mcp_unreachable":
    case "provider_error":
    case "step_budget_exceeded":
    case "turn_timeout":
    case "empty_response":
      return true;
  }
}
```

**Why `surface`**: lets `ChatErrorBlock` know whether to render the
error in place of the assistant turn (`pre-stream`) or appended to
the partial assistant turn that already streamed some content
(`in-stream`).

---

## 5. v6 UI-message-stream parts (consumed)

The reducer must exhaustively switch on this union. Names match
the AI SDK v6 wire shape. Unknown `type` values trigger one
`console.warn` and are then ignored.

```ts
type StreamPart =
  | { type: "start" }                                            // turn beginning marker
  | { type: "start-step" }                                       // model step beginning
  | { type: "text-delta"; delta: string; id?: string }           // assistant text token(s)
  | { type: "text-end"; id?: string }                            // assistant text segment closed
  | { type: "tool-call";
      toolCallId: string;
      toolName: string;
      input?: unknown }                                          // model invoked an MCP tool
  | { type: "tool-result";
      toolCallId: string;
      output: unknown }                                          // tool returned (possibly an error envelope)
  | { type: "finish-step" }                                      // step ended
  | { type: "finish" }                                           // turn ended cleanly
  | { type: "error"; errorText: string }                         // terminal in-stream error (errorText is JSON)
  | { type: string; [k: string]: unknown };                      // forward-compatible catch-all
```

Reducer mapping (one-line summaries; full implementation in
`apps/web/src/stores/chat/chat-stream.ts`):

| Part                     | Effect on store                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `start` / `start-step`   | No-op (markers only).                                                                                 |
| `text-delta`             | Append `delta` to the active assistant message's `text`.                                              |
| `text-end`               | No-op (deltas are already coalesced).                                                                 |
| `tool-call`              | Push a `ToolCallEvent` with status `running` onto the active assistant message's `toolEvents`.        |
| `tool-result`            | Find the matching event by `toolCallId`, set `result`, transition `running → completed` or `failed`. |
| `finish-step`            | No-op.                                                                                                |
| `finish`                 | Transition active assistant message `streaming → complete`; clear `status` to `idle`.                |
| `error`                  | `JSON.parse(errorText)` → `ChatError`; transition active assistant message → `errored`; set `status` → `errored`. |
| (unknown)                | `console.warn` once, ignore.                                                                          |

---

## 6. Store state shape

```ts
import type { StoreApi } from "zustand";

export interface ChatState {
  // Session
  conversationId: string | null;       // null until first send after reset()/init
  messages: DisplayedMessage[];        // ordered, oldest first

  // Lifecycle
  status: ConversationStatus;
  error: ChatError | null;             // populated iff status === "errored"

  // Internals (not consumed by components — used by the orchestrator)
  abortController: AbortController | null;

  // Actions
  send: (text: string) => Promise<void>;     // FR-003 / FR-004 / FR-004a entry point
  stop: () => void;                          // FR-008
  retry: () => Promise<void>;                // FR-009a — drops errored turn, re-issues
  reset: () => void;                         // FR-012 "New chat"
}

export type ChatStore = StoreApi<ChatState>;
```

`send(text)`:
1. If status is `streaming`, no-op (FR-007 b/c — overlap prevention).
2. If `conversationId` is null, generate one with `crypto.randomUUID()`.
3. Append a `UserMessage` to `messages`.
4. Append a fresh `AssistantMessage` (state `streaming`, empty text) to `messages`.
5. Construct request body: `{ messages: serializeHistoryForApi(state.messages), conversationId }`.
6. Set `status = "streaming"`, create new `AbortController`, store on state.
7. `fetch("/api/chat", { method: "POST", body, signal })` →
   - On non-OK pre-stream response → parse JSON via Zod → set `ChatError(surface: "pre-stream")` → mark assistant turn `errored` with this error → `status = "errored"`.
   - On OK streaming response → run reducer over `readUIMessageStream(response.body)`.
8. After reducer terminates (clean finish OR `error` part OR thrown abort) — clean up `abortController`.

`stop()`:
1. If status is not `streaming`, no-op.
2. Call `abortController.abort()`.
3. Mark active assistant message state `streaming → stopped`.
4. For each tool event in that message with status `running`, transition to `stopped`.
5. Set `status = "idle"`.

`retry()`:
1. If status is not `errored`, no-op.
2. Find the trailing assistant message with state `errored` and remove it (FR-009a).
3. Find the immediately-preceding user message and capture its text.
4. Clear `error`, set `status = "idle"`.
5. Call `send(userText)` with the captured text. (Reuses same `conversationId`.)

`reset()`:
1. If status is `streaming`, abort first.
2. Clear `messages`, `error`, `conversationId`, `abortController`.
3. Set `status = "idle"`.

---

## 7. History serialization rule (FR-004a)

The serializer emits the AI SDK v6 `UIMessage` shape (`{id, role, parts}`)
with text parts and `dynamic-tool` parts. The server route then passes
this payload through `convertToModelMessages` to produce the
provider-correct `tool-call` / `tool-result` content parts that providers
like OpenAI / Anthropic require. (Earlier drafts of this spec emitted a
flat `{role: "tool", content: "<json>"}` shape; that was a real bug —
providers reject `tool` role messages that aren't linked to a preceding
assistant `tool_calls` array. Fixed in 005.)

```ts
// apps/web/src/stores/chat/chat-history.ts
import type { DisplayedMessage } from "./types";

export interface ApiUIMessage {
  id: string;
  role: "user" | "assistant";
  parts: ApiUIMessagePart[];
}

export type ApiUIMessagePart =
  | { type: "text"; text: string }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      state: "output-available";
      input: unknown;
      output: unknown;
    }
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      state: "output-error";
      input: unknown;
      errorText: string;
    };

/**
 * Build the messages[] array for POST /api/chat per FR-004a:
 *
 * - User messages: always included as a UIMessage with one text part.
 * - Assistant messages with state `complete`:
 *     - the text becomes a `text` part (only when non-empty)
 *     - each `completed` tool event becomes a `dynamic-tool` part with
 *       `state: "output-available"` carrying the tool's input + output
 *     - each `failed` tool event becomes a `dynamic-tool` part with
 *       `state: "output-error"` carrying the input + scrubbed errorText
 * - Assistant messages with state `streaming` | `stopped` | `errored`:
 *   dropped. Their tool events are dropped too (no half-finished tool
 *   reasoning sent back to the model).
 */
export function serializeHistoryForApi(
  messages: DisplayedMessage[],
): ApiUIMessage[] {
  const out: ApiUIMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        id: m.id,
        role: "user",
        parts: [{ type: "text", text: m.text }],
      });
      continue;
    }
    if (m.state !== "complete") continue;

    const parts: ApiUIMessagePart[] = [];
    if (m.text.length > 0) parts.push({ type: "text", text: m.text });

    for (const event of m.toolEvents) {
      if (event.status === "completed") {
        parts.push({
          type: "dynamic-tool",
          toolName: event.toolName,
          toolCallId: event.id,
          state: "output-available",
          input: event.args ?? {},
          output: event.result ?? null,
        });
      } else if (event.status === "failed") {
        parts.push({
          type: "dynamic-tool",
          toolName: event.toolName,
          toolCallId: event.id,
          state: "output-error",
          input: event.args ?? {},
          errorText:
            event.errorEnvelope?.message ??
            JSON.stringify({
              error: event.errorEnvelope ?? { code: "unknown", message: "" },
            }),
        });
      }
      // running / stopped — dropped
    }

    if (parts.length === 0) continue;
    out.push({ id: m.id, role: "assistant", parts });
  }
  return out;
}
```

This function is **the** single FR-004a expression. It has unit
tests in `chat-history.test.ts`. Any change to history rules
changes only this file.

---

## 8. Component prop contracts (summary — full contracts in `contracts/chat-ui.md`)

- `ChatPageClient` — top-level; subscribes to the store, renders
  `ChatThread`, `ChatInput`, header chrome, "New chat" button.
- `ChatThread` — props: `messages`, `status`, `error`. Owns the
  scroll container and auto-scroll-with-pause behavior.
- `ChatMessage` — props: `message: DisplayedMessage`. Branches on
  `role`. Assistant turns delegate to `MarkdownContent` for `text`
  and render `ToolCallIndicator` per `toolEvents` element.
- `ToolCallIndicator` — props: `event: ToolCallEvent`. Renders a
  pill with tool name and status icon; leaves a structural slot
  (placeholder caret) for Phase 3.7 to expand args/result.
- `ChatInput` — props: `disabled`, `onSend(text)`, `onStop()`,
  `streaming`. Owns its own input value (uncontrolled-ish via
  local state); enforces 10k char cap (FR-014); shows counter
  past 80%.
- `ChatEmptyState` — props: `onSelectPrompt(text, autoSend)`.
  Renders the three FR-013 starter chips.
- `ChatErrorBlock` — props: `error: ChatError`, `onRetry?: () => void`.
  Renders the localized error and Retry where retryable.
- `MarkdownContent` — props: `text: string`. Wraps `Streamdown`
  with our typography classes and explicit allowed-elements config.

---

## 9. Out of scope (intentionally not modeled)

- **Conversation history persistence** — Phase 3.6.
- **Cross-tab synchronization** — deferred to Phase 3.6 with persistence.
- **Tool-call argument/result rich rendering** — Phase 3.7 expansion slot.
- **Per-message reactions, edit, delete** — not in any current phase.
- **Conversation list / multiple conversations** — not in any current phase.
