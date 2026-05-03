/**
 * Zod validation for POST /api/chat request bodies.
 *
 * The wire format is the AI SDK v6 `UIMessage[]` shape — the same shape the
 * SDK's `useChat` hook ships and the same shape `convertToModelMessages`
 * consumes on the server. Adopting it everywhere lets the route delegate
 * provider-specific message construction (assistant `tool-call` parts +
 * matching `tool-result` parts) to the SDK instead of fabricating a flat
 * `{role, content}` payload that providers like OpenAI / Anthropic reject
 * once tool history accumulates.
 *
 * Constraints we still enforce ourselves (independent of the SDK's shape
 * validation):
 *   - 1..CHAT_MAX_MESSAGES messages per request
 *   - role is `user` | `assistant` (system rejected — FR-008a)
 *   - each text part: 1..CHAT_MAX_MESSAGE_CHARS chars
 *   - conversationId optional, ≤ CHAT_CONVERSATION_ID_MAX chars
 *   - top-level `system` field rejected (FR-008a)
 */

import { z } from "zod";

import { CHAT_CONVERSATION_ID_MAX, CHAT_MAX_MESSAGE_CHARS, CHAT_MAX_MESSAGES } from "./chat-config";

const RoleSchema = z.enum(["user", "assistant"]);

const TextPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1, "content_empty").max(CHAT_MAX_MESSAGE_CHARS, "content_too_long"),
  })
  .passthrough();

/**
 * Replayed tool history. We accept only the two terminal states — completed
 * (`output-available`) and failed (`output-error`). In-flight states never
 * appear in a request body because the client drops stopped/errored partial
 * turns before serializing (FR-004a).
 */
const DynamicToolPartCompletedSchema = z
  .object({
    type: z.literal("dynamic-tool"),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1),
    state: z.literal("output-available"),
    input: z.unknown(),
    output: z.unknown(),
  })
  .passthrough();

const DynamicToolPartFailedSchema = z
  .object({
    type: z.literal("dynamic-tool"),
    toolName: z.string().min(1),
    toolCallId: z.string().min(1),
    state: z.literal("output-error"),
    input: z.unknown(),
    errorText: z.string(),
  })
  .passthrough();

const StepStartPartSchema = z.object({ type: z.literal("step-start") }).passthrough();

const UIMessagePartSchema = z.union([
  TextPartSchema,
  DynamicToolPartCompletedSchema,
  DynamicToolPartFailedSchema,
  StepStartPartSchema,
]);

const UIMessageSchema = z
  .object({
    id: z.string().optional(),
    role: RoleSchema,
    parts: z.array(UIMessagePartSchema).min(1, "empty_parts"),
  })
  .passthrough();

export const ChatRequestSchema = z
  .object({
    messages: z.array(UIMessageSchema).min(1, "empty").max(CHAT_MAX_MESSAGES, "too_many_messages"),
    conversationId: z.string().max(CHAT_CONVERSATION_ID_MAX, "conversation_id_invalid").optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatRequestUIMessage = z.infer<typeof UIMessageSchema>;

/**
 * Convert a ZodError into a stable `reason` string. Falls back to a generic
 * `invalid_body` marker. Named reasons preserved for backwards compatibility
 * with the existing logger and client UX:
 *
 *   - `system_role_forbidden` — client tried to set role: "system" or top-level system
 *   - `invalid_role`           — any other role enum mismatch
 *   - `too_many_messages`      — > CHAT_MAX_MESSAGES
 *   - `empty`                  — empty messages array
 *   - `content_too_long`       — text part exceeded CHAT_MAX_MESSAGE_CHARS
 *   - `content_empty`          — text part empty
 *   - `conversation_id_invalid`— conversationId longer than the cap
 */
export function describeValidationError(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "invalid_body";

  if (first.code === "unrecognized_keys") {
    const keys = (first as { keys?: string[] }).keys;
    if (keys?.includes("system")) return "system_role_forbidden";
    return "invalid_body";
  }

  if (first.code === "invalid_enum_value") {
    const received = (first as { received?: unknown }).received;
    if (received === "system") return "system_role_forbidden";
    return "invalid_role";
  }

  return first.message || "invalid_body";
}
