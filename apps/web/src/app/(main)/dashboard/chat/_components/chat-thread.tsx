"use client";

import { useEffect } from "react";

import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAutoScrollToBottom } from "@/lib/chat/auto-scroll";
import { isRetryable } from "@/lib/chat/chat-error-parsing";
import { useChatStore } from "@/stores/chat/chat-store";
import type { ChatError, ConversationStatus, DisplayedMessage } from "@/stores/chat/types";

import { ChatEmptyState } from "./chat-empty-state";
import { ChatErrorBlock } from "./chat-error-block";
import { ChatMessage } from "./chat-message";

interface ChatThreadProps {
  messages: DisplayedMessage[];
  status: ConversationStatus;
  error: ChatError | null;
  onSelectStarter: (text: string, autoSend: boolean) => void;
}

/**
 * Scrollable thread area. Owns auto-scroll-with-pause behavior via the
 * IntersectionObserver-based hook in `lib/chat/auto-scroll.ts`.
 *
 * Renders:
 *   - `<ChatEmptyState>` when there are zero messages and no top-level error.
 *   - One `<ChatMessage>` per message.
 *   - A "Jump to latest" button when the user has scrolled up.
 *   - A standalone `<ChatErrorBlock>` only when the error has no assistant
 *     bubble to attach to (the store always appends an empty assistant
 *     bubble at the start of `send()`, so this is mostly defensive).
 */
export function ChatThread({ messages, status, error, onSelectStarter }: ChatThreadProps) {
  const { scrollContainerRef, sentinelRef, isAtBottom, jumpToLatest } = useAutoScrollToBottom<
    HTMLDivElement,
    HTMLDivElement
  >();
  const retry = useChatStore((s) => s.retry);

  // Auto-scroll on every render where the user is "at bottom". The store
  // returns a new `messages` reference on every update so this effect
  // re-fires on each text-delta without a manual content-change listener.
  // The scroll is a no-op when the sentinel is already in view, so
  // over-firing is harmless.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depending on `messages` is intentional — re-fire on every delta.
  useEffect(() => {
    if (isAtBottom) {
      sentinelRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, isAtBottom]);

  const isEmpty = messages.length === 0 && !error;
  const lastMessage = messages[messages.length - 1];
  const lastIsErroredAssistant = lastMessage?.role === "assistant" && lastMessage.state === "errored";
  const showStandaloneError = !!error && !lastIsErroredAssistant;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" data-testid="chat-thread-scroll">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {isEmpty ? (
            <ChatEmptyState onSelectPrompt={onSelectStarter} />
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}

          {showStandaloneError && error ? (
            <ChatErrorBlock error={error} onRetry={isRetryable(error.code) ? retry : undefined} />
          ) : null}

          {/* Sentinel — kept inside the scrollable region so the observer can
              detect when the user scrolls away from the bottom. */}
          <div ref={sentinelRef} aria-hidden="true" />
        </div>
      </div>

      {!isAtBottom ? (
        <div className="-translate-x-1/2 absolute bottom-2 left-1/2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={jumpToLatest}
            className="gap-1 shadow-md"
            aria-label="Jump to latest message"
          >
            <ArrowDown className="size-4" />
            Jump to latest
          </Button>
        </div>
      ) : null}

      {/* `status` is currently used by callers via the input bar. Reserved
          here for future use (e.g. typing indicators). */}
      <span hidden data-status={status} />
    </div>
  );
}
