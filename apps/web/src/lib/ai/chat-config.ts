/**
 * Configuration constants for POST /api/chat.
 *
 * Hard caps (no env override) are fixed by product policy:
 *   - CHAT_MAX_MESSAGES        — FR-008   (max 100 messages per request)
 *   - CHAT_MAX_MESSAGE_CHARS   — FR-008   (max 10,000 chars per message)
 *   - CHAT_CONVERSATION_ID_MAX — Clarifications session 2026-04-20 (#11)
 *
 * Tunable constants (env overrides):
 *   - CHAT_MAX_STEPS           — FR-005 / NFR-002
 *   - CHAT_TURN_TIMEOUT_MS     — FR-011a
 *
 * See specs/004-chat-streaming-api/data-model.md §5.
 */

export const CHAT_MAX_MESSAGES = 100;
export const CHAT_MAX_MESSAGE_CHARS = 10_000;
export const CHAT_CONVERSATION_ID_MAX = 200;

const DEFAULT_CHAT_MAX_STEPS = 5;
const DEFAULT_CHAT_TURN_TIMEOUT_MS = 60_000;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[chat] ignoring invalid ${label}="${raw}"; falling back to ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

export const CHAT_MAX_STEPS = parsePositiveInt(
  process.env.CHAT_MAX_STEPS,
  DEFAULT_CHAT_MAX_STEPS,
  "CHAT_MAX_STEPS",
);

export const CHAT_TURN_TIMEOUT_MS = parsePositiveInt(
  process.env.CHAT_TURN_TIMEOUT_MS,
  DEFAULT_CHAT_TURN_TIMEOUT_MS,
  "CHAT_TURN_TIMEOUT_MS",
);

/**
 * Placeholder system prompt for this phase.
 *
 * Phase 3.4 will replace this with the real domain-restricted prompt once
 * that feature lands; the chat route's contract does not change.
 */
export const CHAT_SYSTEM_PROMPT =
  "You are a helpful assistant for a price-monitoring application.";
