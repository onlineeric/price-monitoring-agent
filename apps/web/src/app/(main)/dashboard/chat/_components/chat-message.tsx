"use client";

import { Square } from "lucide-react";

import { isRetryable } from "@/lib/chat/chat-error-parsing";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat/chat-store";
import type { AssistantMessage, DisplayedMessage } from "@/stores/chat/types";

import { ChatErrorBlock } from "./chat-error-block";
import { MarkdownContent } from "./markdown-content";
import { ToolCallIndicator } from "./tool-call-indicator";

interface ChatMessageProps {
  message: DisplayedMessage;
}

/**
 * One bubble in the chat thread. Branches on `message.role`.
 *
 * - User messages render as plain text (right-aligned, primary background).
 *   Markdown is intentionally NOT applied to user input.
 * - Assistant messages render Markdown text plus inline tool-call indicators.
 *   The visual treatment depends on the message `state`:
 *     - `streaming` (with empty text) → "thinking" placeholder (FR-007a).
 *     - `streaming` (with text) → live region (`aria-live="polite"`).
 *     - `complete` → static rendering.
 *     - `stopped` → static rendering + small "stopped" badge.
 *     - `errored` → static rendering; the page-level `<ChatErrorBlock>` is
 *       appended after the streamed-so-far text by the caller (US3 / T026).
 */
export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex w-full justify-end" data-testid="chat-message-user">
        <div
          className={cn(
            "max-w-[85%] rounded-lg bg-primary px-4 py-2 text-primary-foreground",
            "whitespace-pre-wrap break-words",
          )}
        >
          {message.text}
        </div>
      </div>
    );
  }

  return <AssistantBubble message={message} />;
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const isStreamingEmpty = message.state === "streaming" && message.text.length === 0;
  const retry = useChatStore((s) => s.retry);

  return (
    <div className="flex w-full justify-start" data-testid="chat-message-assistant" data-message-state={message.state}>
      <div
        className={cn("flex max-w-[85%] flex-col gap-2 rounded-lg bg-muted px-4 py-2 text-foreground")}
        aria-live={message.state === "streaming" ? "polite" : undefined}
        role={message.state === "streaming" ? "status" : undefined}
      >
        {message.toolEvents.map((event) => (
          <ToolCallIndicator key={event.id} event={event} />
        ))}

        {isStreamingEmpty ? <ThinkingDots /> : message.text.length > 0 ? <MarkdownContent text={message.text} /> : null}

        {message.state === "stopped" ? (
          <div className="flex items-center gap-1 self-start rounded-md bg-background/60 px-2 py-0.5 text-muted-foreground text-xs">
            <Square className="size-3" aria-hidden="true" />
            stopped
          </div>
        ) : null}

        {message.state === "errored" && message.error ? (
          <ChatErrorBlock error={message.error} onRetry={isRetryable(message.error.code) ? retry : undefined} />
        ) : null}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <output className="flex items-center gap-1 py-1" aria-label="Assistant is thinking">
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </output>
  );
}
