/**
 * Error taxonomy for POST /api/chat.
 *
 * `validation_error`, `provider_config_missing`, and `mcp_unreachable` surface
 * as pre-stream HTTP JSON responses (the turn never opens a data stream).
 *
 * `provider_error`, `step_budget_exceeded`, `turn_timeout`, and `empty_response`
 * surface as in-stream `error` events on the AI SDK v6 UI-message stream.
 *
 * See specs/004-chat-streaming-api/data-model.md §2.1 and contracts/chat-api.md.
 */

export type ChatErrorCode =
  | "validation_error"
  | "provider_config_missing"
  | "mcp_unreachable"
  | "provider_error"
  | "step_budget_exceeded"
  | "turn_timeout"
  | "empty_response";

/** Shape of the pre-stream JSON error body and in-stream error event payload. */
export interface ChatErrorPayload {
  error: {
    code: ChatErrorCode;
    message: string;
  };
}

export function makeChatError(
  code: ChatErrorCode,
  message: string,
): ChatErrorPayload {
  return { error: { code, message: scrubMessage(message) } };
}

/**
 * Strip anything that could resemble API keys, stack traces, or absolute
 * filesystem paths from a client-facing error message (NFR-003).
 *
 * This is deliberately conservative — when in doubt we replace rather than
 * reveal. The redacted form still names the failure mode via `code` so the
 * UI can recognize it.
 */
export function scrubMessage(raw: string): string {
  if (!raw) return "An error occurred.";
  let message = raw;

  // Drop any "at <file>:<line>:<col>" style stack frames.
  message = message.replace(/\s+at\s+[^\n]+/g, "");

  // Drop absolute POSIX/Windows paths (/foo/bar, C:\foo\bar).
  message = message.replace(/(?:\/|[A-Za-z]:\\)[^\s"']+/g, "[redacted-path]");

  // Drop anything that looks like an API key or bearer token.
  message = message.replace(
    /\b(?:sk|pk|rk|gsk|xai|ant|openai|anthropic|google)[\w-]{8,}\b/gi,
    "[redacted-secret]",
  );
  message = message.replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted-secret]");

  // Drop known API-key env var names from the message body (defense-in-depth
  // so an errant `error.message` that echoes the env name does not leak the
  // actual value on providers that interpolate both).
  for (const key of API_KEY_ENV_VARS) {
    const value = process.env[key];
    if (value && value.length >= 8) {
      message = message.split(value).join("[redacted-secret]");
    }
  }

  return message.trim() || "An error occurred.";
}

const API_KEY_ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
];

/**
 * Emit a `{ code, message }` error into an AI SDK v6 UI message stream writer.
 *
 * The v6 UIMessageStreamWriter exposes `write({ type: "error", errorText })`
 * which is the documented way to surface a terminal in-stream error that the
 * client's `useChat` hook can render. We serialize the structured
 * `ChatErrorPayload` to JSON so the UI can recover `{ code, message }` from
 * the single string field.
 */
/**
 * Shape we expect from the AI SDK v6 `UIMessageStreamWriter`. Kept as a
 * structural type so the helper is trivial to exercise from tests without
 * importing the concrete SDK class.
 */
export interface ChatErrorWriter {
  write(chunk: { type: "error"; errorText: string }): void;
}

export function emitChatError(
  writer: ChatErrorWriter,
  code: ChatErrorCode,
  message: string,
): void {
  const payload = makeChatError(code, message);
  writer.write({ type: "error", errorText: JSON.stringify(payload) });
}
