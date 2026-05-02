import type { DisplayedMessage } from "./types";

/**
 * One UIMessage in the request body for POST /api/chat.
 *
 * Mirrors the AI SDK v6 `UIMessage` shape that the server validates and
 * passes through `convertToModelMessages` to produce the provider-specific
 * `tool-call` / `tool-result` content parts that providers like OpenAI and
 * Anthropic require. Spec 005 contracts/chat-ui.md §2 documents this wire
 * format.
 */
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
 * - `user` messages: always included as a UIMessage with a single text part.
 * - `assistant` messages with state `complete`:
 *     - the text becomes a `text` part (only when non-empty)
 *     - each `completed` tool event becomes a `dynamic-tool` part with
 *       `state: "output-available"` carrying the tool's input + output
 *     - each `failed` tool event becomes a `dynamic-tool` part with
 *       `state: "output-error"` carrying the tool's input + the scrubbed
 *       errorText
 * - `assistant` messages with state `streaming` | `stopped` | `errored` are
 *   dropped entirely. Their tool events are dropped too — the model must not
 *   see half-finished prior reasoning on a follow-up.
 *
 * Pure function. Tested in `chat-history.test.ts`.
 */
export function serializeHistoryForApi(messages: DisplayedMessage[]): ApiUIMessage[] {
  const out: ApiUIMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({
        id: message.id,
        role: "user",
        parts: [{ type: "text", text: message.text }],
      });
      continue;
    }

    if (message.state !== "complete") continue;

    const parts: ApiUIMessagePart[] = [];

    if (message.text.length > 0) {
      parts.push({ type: "text", text: message.text });
    }

    for (const event of message.toolEvents) {
      if (event.status === "completed") {
        parts.push({
          type: "dynamic-tool",
          toolName: event.toolName,
          toolCallId: event.id,
          state: "output-available",
          input: event.args ?? {},
          output: event.result ?? null,
        });
        continue;
      }
      if (event.status === "failed") {
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
      // running / stopped — drop
    }

    if (parts.length === 0) continue;

    out.push({ id: message.id, role: "assistant", parts });
  }

  return out;
}
