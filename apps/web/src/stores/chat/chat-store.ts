import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { parseChatErrorPayload } from "@/lib/chat/chat-error-parsing";

import { serializeHistoryForApi } from "./chat-history";
import { consumeChatStream } from "./chat-stream";
import type { AssistantMessage, ChatError, ChatState, DisplayedMessage, UserMessage } from "./types";

/**
 * Module-level Zustand singleton (per-tab) for the active chat conversation.
 *
 * Why a single store rather than the AI SDK's `useChat` hook:
 * - The store is the canonical state owner per FR-010 — state must survive
 *   in-app navigation away and back without lifting a hook above the layout.
 * - FR-004a's history-serialization rule and FR-009a's retry rule are
 *   custom transitions a hook cannot express cleanly.
 * - `stop()` must mark every still-running tool indicator `stopped` in the
 *   same `set()` call that flips the assistant turn — see `data-model.md` §6.
 *
 * The stream consumer is exposed as a seam (`__streamConsumer`) so tests
 * can inject a fake without going through `fetch`.
 */

type ChatStateInternal = ChatState & {
  __streamConsumer: typeof consumeChatStream;
};

function newAssistantMessage(): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: "",
    toolEvents: [],
    state: "streaming",
  };
}

function newUserMessage(text: string): UserMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    text,
  };
}

/**
 * Lightweight client-side logger for chat-store events.
 *
 * Centralized so NFR-005 ("no client-side leakage of API keys / paths /
 * env-var values") has exactly one place to scrub if defense-in-depth ever
 * becomes necessary. Today the API already scrubs error messages via
 * `chat-errors.ts:scrubMessage`; this helper just adds a tag + level.
 */
export const chatLogger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) console.warn(`[chat] ${message}`, meta);
    else console.warn(`[chat] ${message}`);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) console.error(`[chat] ${message}`, meta);
    else console.error(`[chat] ${message}`);
  },
};

/**
 * Sanitize a persisted message list so a turn that was mid-stream when the
 * previous session ended (tab closed, hard refresh) does not come back as a
 * stuck "thinking" bubble.
 *
 * Any assistant turn still in `streaming` flips to `stopped`, and any tool
 * event still `running` flips to `stopped` — the same terminal shape the
 * Stop button produces, so the UI renders it consistently.
 */
function sanitizeRehydratedMessages(messages: DisplayedMessage[]): DisplayedMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    if (message.state !== "streaming") return message;
    return {
      ...message,
      state: "stopped" as const,
      toolEvents: message.toolEvents.map((event) =>
        event.status === "running" ? { ...event, status: "stopped" as const } : event,
      ),
    };
  });
}

export const useChatStore = create<ChatStateInternal>()(
  persist(
    (set, get) => ({
      conversationId: null,
      messages: [],
      status: "idle",
      error: null,
      abortController: null,

      __streamConsumer: consumeChatStream,

      send: async (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) return;

        const state = get();
        if (state.status === "streaming") return; // FR-007 b/c — overlap prevention

        const conversationId = state.conversationId ?? crypto.randomUUID();
        const assistant = newAssistantMessage();
        const user = newUserMessage(trimmed);
        const nextMessages: DisplayedMessage[] = [...state.messages, user, assistant];
        const requestBodyMessages = serializeHistoryForApi([...state.messages, user]);
        const abortController = new AbortController();

        set({
          conversationId,
          messages: nextMessages,
          status: "streaming",
          error: null,
          abortController,
        });

        let response: Response;
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: requestBodyMessages,
              conversationId,
            }),
            signal: abortController.signal,
          });
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            // The user pressed Stop before the response started — `stop()` already
            // marked the assistant turn as stopped, so just return.
            return;
          }
          const error = parseChatErrorPayload("Network error — please retry.", "pre-stream");
          markActiveAssistantErrored(set, error);
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          const error = parseChatErrorPayload(body, "pre-stream");
          markActiveAssistantErrored(set, error);
          return;
        }

        await get().__streamConsumer(response, set, abortController.signal);

        // Defensive cleanup: if the stream finished without emitting a `finish`
        // (e.g. the server closed the body abruptly), make sure we don't leave
        // the page stuck in `streaming`.
        const after = get();
        if (after.status === "streaming") {
          const error: ChatError = {
            code: "provider_error",
            message: "Stream ended unexpectedly.",
            surface: "in-stream",
          };
          markActiveAssistantErrored(set, error);
        }
      },

      stop: () => {
        const state = get();
        if (state.status !== "streaming") return;

        state.abortController?.abort();

        set((current) => {
          const next = [...current.messages];
          for (let i = next.length - 1; i >= 0; i--) {
            const message = next[i];
            if (message.role !== "assistant") continue;
            next[i] = {
              ...message,
              state: "stopped",
              toolEvents: message.toolEvents.map((event) =>
                event.status === "running" ? { ...event, status: "stopped" } : event,
              ),
            };
            break;
          }
          return {
            messages: next,
            status: "idle",
            error: null,
            abortController: null,
          };
        });
      },

      retry: async () => {
        const state = get();
        if (state.status !== "errored") return;

        // Find the trailing errored assistant and the user message that produced it.
        const indexes = findTrailingFailedTurn(state.messages);
        if (!indexes) return;

        const userText = (state.messages[indexes.userIndex] as UserMessage).text;
        const trimmedMessages = state.messages.slice(0, indexes.userIndex);

        set({
          messages: trimmedMessages,
          status: "idle",
          error: null,
        });

        await get().send(userText);
      },

      reset: () => {
        const state = get();
        if (state.status === "streaming") {
          state.abortController?.abort();
        }
        set({
          conversationId: null,
          messages: [],
          status: "idle",
          error: null,
          abortController: null,
        });
      },
    }),
    {
      name: "price-monitor-chat",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the conversation contents are persisted. Lifecycle fields
      // (`status`, `error`, `abortController`) are session-only and the
      // action functions + test seam are reconstructed by the store factory.
      partialize: (state) => ({
        conversationId: state.conversationId,
        messages: state.messages,
      }),
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        rehydrated.messages = sanitizeRehydratedMessages(rehydrated.messages);
        rehydrated.status = "idle";
        rehydrated.error = null;
        rehydrated.abortController = null;
      },
    },
  ),
);

// -- Helpers ------------------------------------------------------------------

type ChatSetter = (
  partial: Partial<ChatStateInternal> | ((state: ChatStateInternal) => Partial<ChatStateInternal>),
) => void;

/**
 * Mark the trailing assistant turn as `errored` and flip the conversation
 * status to `errored`. Used for both pre-stream HTTP errors and the
 * post-stream defensive cleanup when the body ended without a `finish`.
 */
function markActiveAssistantErrored(set: ChatSetter, error: ChatError): void {
  set((current) => {
    const next = [...current.messages];
    for (let i = next.length - 1; i >= 0; i--) {
      const message = next[i];
      if (message.role !== "assistant") continue;
      next[i] = { ...message, state: "errored", error };
      break;
    }
    return {
      messages: next,
      status: "errored",
      error,
      abortController: null,
    };
  });
}

function findTrailingFailedTurn(messages: DisplayedMessage[]): { assistantIndex: number; userIndex: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (message.state !== "errored") return null;
    // Walk back for the user message that produced this turn.
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        return { assistantIndex: i, userIndex: j };
      }
    }
    return null;
  }
  return null;
}

// Selectors — keep components from re-rendering on unrelated state changes.
export const selectMessages = (s: ChatState) => s.messages;
export const selectStatus = (s: ChatState) => s.status;
export const selectError = (s: ChatState) => s.error;
export const selectConversationId = (s: ChatState) => s.conversationId;
