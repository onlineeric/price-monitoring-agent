import { z } from "zod";

import type { ChatError, ChatErrorCode, ChatErrorSurface } from "@/stores/chat/types";

/**
 * Zod schema for the `{ error: { code, message } }` envelope produced by
 * `apps/web/src/lib/ai/chat-errors.ts`. Used to validate both pre-stream
 * HTTP error bodies and the JSON payload inside an in-stream `error` part.
 *
 * The enum is duplicated locally rather than imported from the server-side
 * module to keep this client-side parser self-contained. Any change to the
 * server-side `ChatErrorCode` should be reflected here AND in
 * `@/stores/chat/types`.
 */
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

/** Bound the fallback message so a malformed payload cannot flood the UI. */
const MAX_FALLBACK_MESSAGE_LENGTH = 500;

const FALLBACK_MESSAGE = "An unexpected error occurred.";

function clampMessage(raw: string): string {
  if (!raw) return FALLBACK_MESSAGE;
  if (raw.length <= MAX_FALLBACK_MESSAGE_LENGTH) return raw;
  return `${raw.slice(0, MAX_FALLBACK_MESSAGE_LENGTH - 1)}…`;
}

/**
 * Parse an opaque `raw` value into a `ChatError`. Never throws.
 *
 * `raw` may be:
 *   - the parsed JSON body of an HTTP 4xx/5xx pre-stream error response, OR
 *   - a `string` (the `errorText` field of an in-stream `error` part), OR
 *   - anything else (malformed payload, network glitch, etc.).
 *
 * On any parse/shape failure we fall back to a synthetic `provider_error`
 * with a bounded message so the UI degrades gracefully rather than crashing
 * the reducer.
 */
export function parseChatErrorPayload(raw: unknown, surface: ChatErrorSurface): ChatError {
  const candidate = typeof raw === "string" ? safeJsonParse(raw) : raw;

  const result = ChatErrorPayloadSchema.safeParse(candidate);
  if (result.success) {
    return {
      code: result.data.error.code,
      message: clampMessage(result.data.error.message),
      surface,
    };
  }

  // Best-effort fallback: if `raw` was a string, surface its bounded form
  // as the message. Otherwise use the generic fallback.
  const fallbackMessage = typeof raw === "string" && raw.length > 0 ? clampMessage(raw) : FALLBACK_MESSAGE;

  return {
    code: "provider_error",
    message: fallbackMessage,
    surface,
  };
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}

/**
 * Whether a Retry affordance should be offered for a given error code.
 *
 * Per FR-009: retries are offered for transient/server-side conditions only.
 * Validation and provider-config errors require user/operator action — a
 * naive retry would fail identically.
 */
export function isRetryable(code: ChatErrorCode): boolean {
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
