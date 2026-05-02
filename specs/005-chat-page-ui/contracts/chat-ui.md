# Contracts — Phase 1: Dashboard Chat Page (Streaming UI)

This file documents the **internal contracts** of the chat page:
the store action signatures, the component prop shapes, the request
body the page sends to `/api/chat` (a subset of spec 004's contract),
and the keyboard map. There are no external HTTP contracts here —
the chat page is purely a consumer of `/api/chat`.

---

## 1. Store API contract (`apps/web/src/stores/chat/chat-store.ts`)

```ts
import { create } from "zustand";
import type { ChatState } from "./types";

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  status: "idle",
  error: null,
  abortController: null,

  send: async (text: string) => { /* see data-model §6 */ },
  stop: () => { /* see data-model §6 */ },
  retry: async () => { /* see data-model §6 */ },
  reset: () => { /* see data-model §6 */ },
}));

// Selectors (avoid re-rendering on unrelated state changes)
export const selectMessages = (s: ChatState) => s.messages;
export const selectStatus   = (s: ChatState) => s.status;
export const selectError    = (s: ChatState) => s.error;
```

### Invariants

- The store is a **module-level singleton**. Two component trees
  importing `useChatStore` see the same state. This is the
  per-tab persistence promised by FR-010.
- `send()` is idempotent w.r.t. concurrent calls: when
  `status === "streaming"`, additional calls are no-ops (FR-007 b/c).
- `stop()` and `retry()` are no-ops outside the states they apply
  to (`streaming` / `errored` respectively).
- `reset()` is always safe; if a turn is streaming, it aborts first.

### Error surfaces

- **Pre-stream errors** (HTTP 4xx/5xx with JSON body): parsed via
  the Zod schema in `apps/web/src/lib/chat/chat-error-parsing.ts`,
  marked with `surface: "pre-stream"`, stored on the trailing
  assistant message and on `state.error`.
- **In-stream errors** (`{ type: "error", errorText }` part):
  parsed the same way, marked with `surface: "in-stream"`,
  attached to whatever partial assistant text already streamed.

---

## 2. Request contract (page → `/api/chat`)

The page sends the AI SDK v6 `UIMessage[]` shape that the server passes
through `convertToModelMessages` to produce provider-correct tool-call /
tool-result content parts:

```jsonc
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {
      "id": "u-1",
      "role": "user",
      "parts": [{ "type": "text", "text": "show my products" }]
    },
    {
      "id": "a-1",
      "role": "assistant",
      "parts": [
        { "type": "text", "text": "You have 3 products:" },
        {
          "type": "dynamic-tool",
          "toolName": "search_products",
          "toolCallId": "call_abc123",
          "state": "output-available",
          "input":  { "query": "" },
          "output": { "products": [/* … */] }
        }
      ]
    },
    {
      "id": "u-2",
      "role": "user",
      "parts": [{ "type": "text", "text": "what's the price trend on the first one?" }]
    }
  ],
  "conversationId": "f1c8a4d2-…-uuidv4"
}
```

### Rules (matching spec 004 + FR-004a)

- `messages` is the output of `serializeHistoryForApi(state.messages)`
  (data-model §7). Stopped/errored assistant turns and their tool
  events are dropped.
- `conversationId` is included on every request once a chat has
  started; absent only on the very first request. (Server accepts
  optional + free-form per spec 004 clarifications.)
- Roles are limited to `user` / `assistant` — no `system` (the server
  rejects it; the page never constructs one). Tool exchanges live as
  `dynamic-tool` parts inside an assistant message rather than as a
  separate `tool` role message.
- Each text part's `text` ≤ 10,000 characters (server cap; the page
  enforces the user-input side via FR-014; assistant turns are
  bounded by the model's own output, which our 5-step / 60s budget
  caps).
- Total messages ≤ 100 per request — the page treats this as a
  soft cap; the store's reducer is fine well past 100, but
  practical conversations will not approach it before Phase 3.6
  introduces persistence and trimming.

### Response handling

- HTTP status not 2xx → parse JSON body as `ChatErrorPayload`,
  surface as a pre-stream `ChatError`.
- HTTP 2xx with a streaming body → pass `response.body` to
  `readUIMessageStream` and reduce parts per data-model §5.
- Network failure / `fetch` rejection that is not an `AbortError`
  from our own `stop()` → surface as a synthetic `provider_error`
  with a generic message ("Network error — please retry.").
- `AbortError` from `stop()` → already handled in the store's
  `stop()` action (assistant turn marked `stopped`); reducer
  loop exits without setting an error.

---

## 3. Component prop contracts

### `ChatPageClient`

```ts
// No props — top-level "use client" component.
// Reads the store, lays out the page, mounts ChatThread + ChatInput.
```

Responsibilities:
- Render the dashboard-style page header ("Chat", short subtitle,
  "New chat" button).
- Mount `ChatThread` and `ChatInput`.
- Refocus the textarea after `status` transitions out of `streaming`.

### `ChatThread`

```ts
interface ChatThreadProps {
  messages: DisplayedMessage[];
  status: ConversationStatus;
  error: ChatError | null;
}
```

Responsibilities:
- Scroll container + bottom sentinel for auto-scroll.
- "Jump to latest" button when sentinel is offscreen.
- Render `<ChatEmptyState />` when `messages.length === 0 && error === null`.
- For each message, render `<ChatMessage />`.
- If `status === "errored"` and the last message is **not** an
  errored assistant (i.e. pre-stream error before any assistant
  bubble was created), render a top-level `<ChatErrorBlock />`.

### `ChatMessage`

```ts
interface ChatMessageProps {
  message: DisplayedMessage;
}
```

Responsibilities:
- Branch on `message.role`.
- User → plain-text bubble (right-aligned, primary background).
- Assistant → markdown-rendered bubble (left-aligned, muted background)
  containing the text and an inline list of `<ToolCallIndicator />` for
  each event in `toolEvents`. If `state === "errored"`, append
  `<ChatErrorBlock />` after the partial text. If `state === "stopped"`,
  show a small "stopped" badge.
- Wrap streaming assistant turn in `aria-live="polite"` + `role="status"`.

### `ToolCallIndicator`

```ts
interface ToolCallIndicatorProps {
  event: ToolCallEvent;
}
```

Responsibilities:
- Render a small pill: `[icon] tool_name [status]`.
- Status icons (lucide-react):
  - `running`   → animated `Loader2`
  - `completed` → `Check` (success color)
  - `failed`    → `AlertCircle` (destructive color)
  - `stopped`   → `Square` (muted color)
- Leave a `<button aria-label="Show details">` placeholder caret
  that does nothing in this phase — Phase 3.7 will hook in.
- ARIA: `role="status"` while `running`; static otherwise.

### `ChatInput`

```ts
interface ChatInputProps {
  status: ConversationStatus;        // determines Send vs Stop
  onSend: (text: string) => void;    // store.getState().send
  onStop: () => void;                // store.getState().stop
}
```

Responsibilities:
- Multi-line textarea (Shadcn `Textarea`) with autosize behavior.
- Enter submits, Shift+Enter inserts newline.
- Send button: enabled iff `status !== "streaming"` and trimmed input length is 1..10000.
- Stop button: visible iff `status === "streaming"`; always enabled.
- Character counter visible once input length > 8000 (80% of cap);
  visually escalates (warning color) as length approaches 10000.

#### Keyboard map

| Keys                | Action                                  |
| ------------------- | --------------------------------------- |
| `Enter`             | Submit (if Send is enabled)             |
| `Shift+Enter`       | Insert newline                          |
| `Cmd/Ctrl+Enter`    | Submit (alternative; explicit support)  |
| `Esc` while streaming | Stop (mirrors Stop button)            |

### `ChatEmptyState`

```ts
interface ChatEmptyStateProps {
  onSelectPrompt: (text: string, autoSend: boolean) => void;
}
```

Responsibilities:
- One short helper paragraph describing the assistant's scope.
- Three starter-prompt chips (FR-013, after Q4 clarification):
  1. "Show me my monitored products." → autoSend = true
  2. "What's the price trend on my [first product]?" → autoSend = true (placeholder text the user can edit before Send)
  3. "Add this product: [paste URL]" → autoSend = **false** (because the user must paste a URL first; sending the literal "[paste URL]" would just be an `add_product` failure).

### `ChatErrorBlock`

```ts
interface ChatErrorBlockProps {
  error: ChatError;
  onRetry?: () => void;             // store.getState().retry — only passed when retryable
}
```

Responsibilities:
- Render a Shadcn `Alert` with `variant="destructive"`.
- Title is a plain-language label per `code` (table below).
- Body is `error.message` (already scrubbed by API).
- Render a Retry button iff `onRetry` is provided AND
  `isRetryable(error.code) === true`.

#### Error-code → label mapping

| Code                         | Plain-language label                     | Retryable |
| ---------------------------- | ---------------------------------------- | --------- |
| `validation_error`           | Couldn't send that message               | No        |
| `provider_config_missing`    | AI provider not configured               | No        |
| `mcp_unreachable`            | Can't reach the data service             | Yes       |
| `provider_error`             | The AI provider hit an error             | Yes       |
| `step_budget_exceeded`       | The assistant tried too many steps       | Yes       |
| `turn_timeout`               | The assistant took too long              | Yes       |
| `empty_response`             | The assistant didn't respond             | Yes       |

### `MarkdownContent`

```ts
interface MarkdownContentProps {
  text: string;
}
```

Responsibilities:
- Wrap `<Streamdown>` with explicit allowed elements (no
  iframe/script/style/event handlers; no `javascript:` /
  unsafe `data:`), our prose Tailwind classes, and the typography
  treatment used in the Shadcn `prose-*` defaults.
- Pure component — no hooks, no state.

---

## 4. Sidebar contract

```ts
// apps/web/src/navigation/sidebar/sidebar-items.ts
// Add the entry below to the "Main" group, between Products and Send Report
// (or wherever feels natural in the existing order — tasks.md will pin the
// exact position).
{
  title: "Chat",
  url: "/dashboard/chat",
  icon: MessageSquare,   // from lucide-react
  isNew: true,           // optional — flags it as a new page in the UI
}
```

---

## 5. Streaming reducer contract (`apps/web/src/stores/chat/chat-stream.ts`)

```ts
import type { ChatState } from "./types";

// Input: a fetch Response whose body is a v6 UI-message stream.
// Output: drives state mutations on the store via the provided `set` fn.
export async function consumeChatStream(
  response: Response,
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  signal: AbortSignal,
): Promise<void> {
  // Implementation: for await (const part of readUIMessageStream(response.body, { signal }))
  // switch on part.type per data-model §5. Unknown types → console.warn once, ignore.
}
```

Invariants:
- The function MUST swallow `AbortError` (it is the expected
  signal for `stop()` and tab close).
- On any other thrown error, surface as a synthetic `provider_error`
  via `set()` and return cleanly.
- The function MUST NOT mutate state outside the `set()` callback
  (single-source-of-truth contract).

---

## 6. Error-parsing contract (`apps/web/src/lib/chat/chat-error-parsing.ts`)

```ts
import { z } from "zod";
import type { ChatError, ChatErrorCode } from "@/stores/chat/types";

const ChatErrorPayloadSchema = z.object({
  error: z.object({
    code: z.enum([
      "validation_error",
      "provider_config_missing",
      "mcp_unreachable",
      "provider_error",
      "step_budget_exceeded",
      "turn_timeout",
      "empty_response",
    ]),
    message: z.string(),
  }),
});

export function parseChatErrorPayload(
  raw: unknown,
  surface: "pre-stream" | "in-stream",
): ChatError;     // never throws — falls back to provider_error on any failure

export function isRetryable(code: ChatErrorCode): boolean;
```

Invariants:
- `parseChatErrorPayload` MUST NOT throw on any input.
- The fallback `provider_error` message is bounded (≤ 500 chars)
  to avoid flooding the UI with a malformed payload.

---

## 7. Tests this contract enables

Each contract surface gets one or more tests:

| File                                | Contracts exercised                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `chat-store.test.ts`                | Store API §1 — send/stop/retry/reset, status state machine, idempotence      |
| `chat-history.test.ts`              | Request rules §2 — FR-004a serialization                                     |
| `chat-error-parsing.test.ts`        | Error parser §6 — every code, malformed payloads, oversize inputs            |
| `chat-page.streaming.test.tsx`      | Reducer §5 + Components §3 (ChatThread, ChatMessage, MarkdownContent)        |
| `chat-page.tools.test.tsx`          | Reducer §5 + Components §3 (ToolCallIndicator state transitions)             |
| `chat-page.errors.test.tsx`         | Components §3 (ChatErrorBlock, retry, Stop, overlap prevention)              |
| `markdown-content.test.tsx`         | Components §3 (MarkdownContent — sanitization)                               |
