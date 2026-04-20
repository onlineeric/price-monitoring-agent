/**
 * Zod validation for POST /api/chat request bodies.
 *
 * Enforces the rules documented in specs/004-chat-streaming-api/data-model.md §1:
 *   - `messages` is 1..CHAT_MAX_MESSAGES items
 *   - `role` is one of `user` | `assistant` | `tool` (system is rejected — FR-008a)
 *   - `content` is 1..CHAT_MAX_MESSAGE_CHARS chars
 *   - `conversationId` is optional, ≤ CHAT_CONVERSATION_ID_MAX chars
 *   - A top-level `system` field is rejected
 *
 * The Zod schema is intentionally the only entry point; the route handler never
 * performs ad hoc checks (Constitution — Typed Maintainability).
 */

import { z } from "zod";

import {
  CHAT_CONVERSATION_ID_MAX,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_MESSAGE_CHARS,
} from "./chat-config";

const ChatRoleSchema = z.enum(["user", "assistant", "tool"]);

const ChatMessageSchema = z
  .object({
    role: ChatRoleSchema,
    content: z
      .string()
      .min(1, "content_empty")
      .max(CHAT_MAX_MESSAGE_CHARS, "content_too_long"),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
  })
  // Accept future AI SDK UIMessage fields without breaking validation, but
  // unknown roles are still rejected because `role` is typed above.
  .passthrough();

export const ChatRequestSchema = z
  .object({
    messages: z
      .array(ChatMessageSchema)
      .min(1, "empty")
      .max(CHAT_MAX_MESSAGES, "too_many_messages"),
    conversationId: z
      .string()
      .max(CHAT_CONVERSATION_ID_MAX, "conversation_id_invalid")
      .optional(),
  })
  // `.strict()` makes any unknown top-level key (notably `system`, which
  // clients might try to inject to override the server prompt — FR-008a)
  // a validation error rather than silently ignoring it.
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Convert a ZodError into a stable `reason` string the route / logger can use
 * as a `validation_error` detail. We prefer the most-specific message emitted
 * by the schema (e.g. `system_role_forbidden`, `too_many_messages`,
 * `content_too_long`). Falls back to a generic `invalid_body` marker.
 */
export function describeValidationError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "invalid_body";

  // Top-level strict-object extras (e.g. `system`) map to the same named
  // reason as a system-role message so the client sees a single code for
  // "you tried to set the system prompt".
  if (first.code === "unrecognized_keys") {
    const keys = (first as { keys?: string[] }).keys;
    if (keys?.includes("system")) return "system_role_forbidden";
    return "invalid_body";
  }

  // Enum mismatch on `messages[i].role` with received === "system" → named
  // reason; any other enum mismatch is `invalid_role`.
  if (first.code === "invalid_enum_value") {
    const received = (first as { received?: unknown }).received;
    if (received === "system") return "system_role_forbidden";
    return "invalid_role";
  }

  return first.message || "invalid_body";
}

/**
 * Produce the message list the AI SDK `streamText` call receives.
 *
 * The caller already validated the role/content bounds; this helper strips
 * any extra passthrough fields we do not want to forward to the provider
 * and preserves the order supplied by the client.
 */
export function normalizeMessages(
  request: ChatRequest,
): { role: ChatMessage["role"]; content: string }[] {
  return request.messages.map((m) => ({ role: m.role, content: m.content }));
}
