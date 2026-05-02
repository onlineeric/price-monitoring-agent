/**
 * Client-side data shapes for the dashboard chat page.
 *
 * Mirrors the entities defined in `specs/005-chat-page-ui/data-model.md`.
 * No database tables, no queue payloads — these types live only in the
 * per-tab Zustand store.
 *
 * Stream-part type names track the AI SDK v6 wire format produced by
 * `/api/chat` (see `apps/web/src/test/api/chat/route.happy-path.test.ts`
 * for a sample): `text-delta`, `tool-input-available`,
 * `tool-output-available`, `tool-output-error`, `error`, `start`,
 * `start-step`, `finish-step`, `finish`, `abort`. The reducer falls back
 * to a `console.warn` on any unknown type, so forward-compatible new
 * parts do not crash the page.
 */

// -- Conversation lifecycle ---------------------------------------------------

export type ConversationStatus = "idle" | "streaming" | "errored";

// -- Displayed messages -------------------------------------------------------

export type MessageRole = "user" | "assistant";

export type AssistantMessageState = "streaming" | "complete" | "stopped" | "errored";

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  toolEvents: ToolCallEvent[];
  state: AssistantMessageState;
  error?: ChatError;
}

export type DisplayedMessage = UserMessage | AssistantMessage;

// -- Tool-call events ---------------------------------------------------------

export type ToolStatus = "running" | "completed" | "failed" | "stopped";

export interface ToolErrorEnvelope {
  code: string;
  message: string;
}

export interface ToolCallEvent {
  /** `toolCallId` from the SDK stream — uniquely identifies this invocation. */
  id: string;
  toolName: string;
  status: ToolStatus;
  /** Phase 3.7 expansion slot — populated when tool-input-available arrives. */
  args?: unknown;
  /** Phase 3.7 expansion slot — populated when tool-output-available arrives. */
  result?: unknown;
  /** Present when status === "failed" (Phase 2.6 tool-error envelope). */
  errorEnvelope?: ToolErrorEnvelope;
}

// -- Chat errors --------------------------------------------------------------

export type ChatErrorCode =
  | "validation_error"
  | "provider_config_missing"
  | "mcp_unreachable"
  | "provider_error"
  | "step_budget_exceeded"
  | "turn_timeout"
  | "empty_response";

export type ChatErrorSurface = "pre-stream" | "in-stream";

export interface ChatError {
  code: ChatErrorCode;
  message: string;
  surface: ChatErrorSurface;
}

// -- v6 UI-message-stream parts (consumed by the reducer) ---------------------

/**
 * Stream-part discriminated union the reducer must handle.
 *
 * Names match the AI SDK v6 wire format observed at runtime
 * (see `route.happy-path.test.ts` and the `UIMessageChunk` typedef in `ai`):
 *   text-{start,delta,end}, tool-input-{start,delta,available,error},
 *   tool-output-{available,error,denied}, tool-approval-request,
 *   reasoning-{start,delta,end}, source-{url,document}, file,
 *   start, start-step, finish-step, finish, abort, error,
 *   message-metadata.
 *
 * We only narrow on the parts the chat page actually renders. Everything
 * else falls through the catch-all and is ignored with one `console.warn`.
 */
export type StreamPart =
  | { type: "start"; messageId?: string }
  | { type: "start-step" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; delta: string; id: string }
  | { type: "text-end"; id: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input?: unknown;
    }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  | { type: "finish-step" }
  | { type: "finish" }
  | { type: "abort" }
  | { type: "error"; errorText: string }
  | { type: string; [k: string]: unknown };

// -- Store state shape --------------------------------------------------------

export interface ChatState {
  conversationId: string | null;
  messages: DisplayedMessage[];
  status: ConversationStatus;
  error: ChatError | null;
  /** Internal — used by `stop()` to abort the in-flight fetch. */
  abortController: AbortController | null;

  send: (text: string) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  reset: () => void;
}
