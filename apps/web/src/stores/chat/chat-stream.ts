import { parseJsonEventStream, uiMessageChunkSchema } from "ai";

import { parseChatErrorPayload } from "@/lib/chat/chat-error-parsing";

import type { AssistantMessage, ChatState, StreamPart, ToolErrorEnvelope } from "./types";

type ChatStateSetter = (updater: (state: ChatState) => Partial<ChatState>) => void;

const warnedTypes = new Set<string>();

function warnUnknownPart(type: string): void {
  if (warnedTypes.has(type)) return;
  warnedTypes.add(type);
  console.warn(`[chat-stream] ignoring unknown part type: ${type}`);
}

/**
 * Update the trailing assistant message via an immutable transform.
 *
 * Returns `{}` when no streaming assistant is found OR when the trailing
 * assistant has already reached a terminal state (`complete` / `stopped` /
 * `errored`). The terminal-state guard matters because aborting the fetch
 * does not synchronously stop the stream parser — chunks already buffered
 * keep arriving after `stop()` and would otherwise mutate a stopped turn.
 */
function updateStreamingAssistant(
  state: ChatState,
  transform: (assistant: AssistantMessage) => AssistantMessage,
): Partial<ChatState> {
  const next = [...state.messages];
  for (let i = next.length - 1; i >= 0; i--) {
    const message = next[i];
    if (message.role !== "assistant") continue;
    if (message.state !== "streaming") return {};
    next[i] = transform(message);
    return { messages: next };
  }
  return {};
}

/**
 * Apply a single stream part to the store via `set`.
 *
 * Exhaustively switches on the AI SDK v6 `UIMessageChunk` discriminant.
 * Unknown types log one `console.warn` and are then ignored.
 */
function applyStreamPart(part: StreamPart, set: ChatStateSetter): void {
  switch (part.type) {
    case "start":
    case "start-step":
    case "text-start":
    case "text-end":
    case "finish-step":
    case "abort":
      // No-op markers in this phase. `abort` indicates the server detected
      // a client disconnect; the client-side `stop()` action handles the
      // visible state transition (assistant → stopped).
      return;

    case "text-delta": {
      const delta = (part as { delta: string }).delta;
      set((state) =>
        updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          text: assistant.text + delta,
        })),
      );
      return;
    }

    case "tool-input-available": {
      const { toolCallId, toolName, input } = part as {
        toolCallId: string;
        toolName: string;
        input?: unknown;
      };
      set((state) =>
        updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          toolEvents: [
            ...assistant.toolEvents,
            {
              id: toolCallId,
              toolName,
              status: "running",
              args: input,
            },
          ],
        })),
      );
      return;
    }

    case "tool-output-available": {
      const { toolCallId, output } = part as {
        toolCallId: string;
        output: unknown;
      };
      const errorEnvelope = extractToolErrorEnvelope(output);
      set((state) =>
        updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          toolEvents: assistant.toolEvents.map((event) =>
            // Only transition tools that are still `running`. A `completed` /
            // `failed` / `stopped` indicator is terminal and must not be
            // overwritten by a late duplicate output event.
            event.id === toolCallId && event.status === "running"
              ? {
                  ...event,
                  result: output,
                  status: errorEnvelope ? "failed" : "completed",
                  errorEnvelope,
                }
              : event,
          ),
        })),
      );
      return;
    }

    case "tool-output-error": {
      const { toolCallId, errorText } = part as {
        toolCallId: string;
        errorText: string;
      };
      const envelope = extractToolErrorEnvelope(errorText) ?? {
        code: "tool_error",
        message: errorText.slice(0, 500),
      };
      set((state) =>
        updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          toolEvents: assistant.toolEvents.map((event) =>
            event.id === toolCallId && event.status === "running"
              ? { ...event, status: "failed", errorEnvelope: envelope }
              : event,
          ),
        })),
      );
      return;
    }

    case "finish": {
      // Only transition to `idle` if there is still an active streaming turn
      // to finalize. After Stop or a terminal error event, the turn is
      // already finished and a late `finish` chunk must not clobber the
      // `errored` status (which would silently hide the error UI).
      set((state) => {
        const update = updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          state: "complete",
        }));
        if (!update.messages) return {};
        return { ...update, status: "idle", abortController: null };
      });
      return;
    }

    case "error": {
      const { errorText } = part as { errorText: string };
      const error = parseChatErrorPayload(errorText, "in-stream");
      set((state) => {
        const update = updateStreamingAssistant(state, (assistant) => ({
          ...assistant,
          state: "errored",
          error,
          toolEvents: assistant.toolEvents.map((event) =>
            event.status === "running" ? { ...event, status: "failed" } : event,
          ),
        }));
        if (!update.messages) return {};
        return { ...update, status: "errored", error, abortController: null };
      });
      return;
    }

    default:
      warnUnknownPart(part.type);
      return;
  }
}

/**
 * Try to interpret an arbitrary tool output as a Phase 2.6 error envelope
 * `{ error: { code, message } }`. Returns `undefined` if the output does not
 * match.
 *
 * Accepts three shapes:
 *   1. A flat object `{ error: { code, message } }` (or its JSON string form).
 *   2. The MCP `CallToolResult` returned by the chat-tools bridge:
 *      `{ isError: true, content: [{ type: "text", text: "{\"error\":...}" }] }`
 *      — produced both by the MCP server's `withErrorHandling` wrapper and
 *      by the bridge's own catch path on connection-level failures.
 *   3. A flat object that already exposes `code` + `message` at the top level
 *      (defensive — some MCP SDKs surface errors this way).
 */
function extractToolErrorEnvelope(output: unknown): ToolErrorEnvelope | undefined {
  const candidate = typeof output === "string" ? safeJsonParse(output) : output;
  if (!candidate || typeof candidate !== "object") return undefined;

  const direct = matchErrorEnvelope(candidate);
  if (direct) return direct;

  const mcp = candidate as {
    isError?: unknown;
    content?: unknown;
  };
  if (mcp.isError === true && Array.isArray(mcp.content)) {
    for (const part of mcp.content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        const parsed = safeJsonParse((part as { text: string }).text);
        const fromText = matchErrorEnvelope(parsed);
        if (fromText) return fromText;
      }
    }
    // Last resort: surface a generic envelope so the indicator still flips
    // to `failed` even if the text payload was not JSON-encoded.
    return { code: "tool_error", message: "Tool reported an error." };
  }

  return undefined;
}

function matchErrorEnvelope(candidate: unknown): ToolErrorEnvelope | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  if (
    "error" in candidate &&
    candidate.error &&
    typeof candidate.error === "object"
  ) {
    const err = candidate.error as { code?: unknown; message?: unknown };
    if (typeof err.code === "string" && typeof err.message === "string") {
      return { code: err.code, message: err.message };
    }
  }
  return undefined;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

/**
 * Read a chat response body and reduce its v6 UI-message-stream parts into
 * the store. `getStreamingAssistant` is exposed for callers that may need to
 * read the active assistant message identity, but the reducer itself does
 * not require it.
 *
 * Invariants (per `contracts/chat-ui.md` §5):
 *   - `AbortError` is swallowed (expected signal from `stop()` and tab close).
 *   - Any other thrown error is surfaced as a synthetic `provider_error`
 *     via `set()`; the function returns cleanly.
 *   - State mutation only happens via `set()`.
 */
export async function consumeChatStream(response: Response, set: ChatStateSetter, signal: AbortSignal): Promise<void> {
  const body = response.body;
  if (!body) {
    const error = parseChatErrorPayload("Streaming response had no body.", "in-stream");
    set((state) => {
      const update = updateStreamingAssistant(state, (assistant) => ({
        ...assistant,
        state: "errored",
        error,
      }));
      if (!update.messages) return {};
      return { ...update, status: "errored", error, abortController: null };
    });
    return;
  }

  const parsed = parseJsonEventStream({
    stream: body,
    schema: uiMessageChunkSchema,
  });
  const reader = parsed.getReader();

  try {
    while (true) {
      if (signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (!value.success) {
        // Malformed JSON in the SSE stream — log once and keep reading; the
        // server is expected to emit a structured `error` part separately
        // on terminal failures, so we should not abort the whole turn here.
        console.warn("[chat-stream] dropped malformed stream part");
        continue;
      }
      applyStreamPart(value.value as StreamPart, set);
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    const error = parseChatErrorPayload(err instanceof Error ? err.message : String(err), "in-stream");
    set((state) => {
      const update = updateStreamingAssistant(state, (assistant) => ({
        ...assistant,
        state: "errored",
        error,
      }));
      if (!update.messages) return {};
      return { ...update, status: "errored", error, abortController: null };
    });
  } finally {
    reader.releaseLock();
  }
}

// Exported for the unit tests so they can drive `applyStreamPart` directly
// instead of building a full `Response`.
export const __testing = { applyStreamPart };
