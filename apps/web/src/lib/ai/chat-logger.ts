/**
 * Per-turn structured logger for POST /api/chat.
 *
 * Every log line carries `turnId` (server-generated per request) and,
 * when present, `conversationId` (FR-012). We emit a single `console.log` /
 * `console.error` line with the `[chat]` prefix plus structured fields so
 * Phase 6.3 can lift these into proper structured tracing without changing
 * call sites.
 *
 * See specs/004-chat-streaming-api/data-model.md §3.
 */

import type { ChatErrorCode } from "./chat-errors";

export interface ChatLoggerContext {
  turnId: string;
  conversationId?: string;
}

export interface ChatLogger {
  turnReceived(details: { messageCount: number; provider: string; model: string }): void;
  toolCallStart(details: { toolName: string; toolCallId: string }): void;
  toolCallEnd(details: {
    toolName: string;
    toolCallId: string;
    durationMs: number;
    outcome: "success" | "error";
    errorCode?: string;
  }): void;
  providerError(details: { message: string }): void;
  validationRejected(details: { reason: string }): void;
  budgetExceeded(details: { steps: number }): void;
  turnTimeout(details: { elapsedMs: number }): void;
  emptyResponse(): void;
  mcpToolListEmpty(): void;
  turnAborted(details: { reason: string }): void;
  turnFinished(details: { finishReason: string; elapsedMs: number }): void;
  warn(message: string, details?: Record<string, unknown>): void;
}

function serializeFields(fields: Record<string, unknown>): string {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}=${JSON.stringify(value)}`;
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(" ");
}

export function createChatLogger(ctx: ChatLoggerContext): ChatLogger {
  const base: Record<string, unknown> = { turnId: ctx.turnId };
  if (ctx.conversationId) base.conversationId = ctx.conversationId;

  function emit(
    stream: "log" | "error",
    event: string,
    fields: Record<string, unknown> = {},
  ) {
    const line = `[chat] ${event} ${serializeFields({ ...base, ...fields })}`.trim();
    if (stream === "error") console.error(line);
    else console.log(line);
  }

  return {
    turnReceived(details) {
      emit("log", "turn_received", details);
    },
    toolCallStart(details) {
      emit("log", "tool_call_start", details);
    },
    toolCallEnd(details) {
      const stream = details.outcome === "error" ? "error" : "log";
      emit(stream, "tool_call_end", details);
    },
    providerError(details) {
      emit("error", "provider_error", details);
    },
    validationRejected(details) {
      emit("error", "validation_rejected", details);
    },
    budgetExceeded(details) {
      emit("error", "budget_exceeded", details);
    },
    turnTimeout(details) {
      emit("error", "turn_timeout", details);
    },
    emptyResponse() {
      emit("error", "empty_response");
    },
    mcpToolListEmpty() {
      emit("log", "warning", { reason: "mcp_tool_list_empty" });
    },
    turnAborted(details) {
      emit("log", "turn_aborted", details);
    },
    turnFinished(details) {
      emit("log", "turn_finished", details);
    },
    warn(message, details) {
      emit("log", "warning", { message, ...(details ?? {}) });
    },
  };
}

export type { ChatErrorCode };
