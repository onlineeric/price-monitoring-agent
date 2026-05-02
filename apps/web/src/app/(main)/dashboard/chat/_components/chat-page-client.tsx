"use client";

import { useCallback, useEffect, useRef } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { selectError, selectMessages, selectStatus, useChatStore } from "@/stores/chat/chat-store";

import { ChatInput } from "./chat-input";
import { ChatThread } from "./chat-thread";

/**
 * Top-level client component for the chat page.
 *
 * Subscribes to the Zustand store with stable selectors so re-renders only
 * happen on the slice that changed (FR-010 / NFR-001).
 *
 * Layout: dashboard-style page header with a "New chat" button on top,
 * scrollable thread in the middle, persistent input bar at the bottom.
 */
export function ChatPageClient() {
  const messages = useChatStore(selectMessages);
  const status = useChatStore(selectStatus);
  const error = useChatStore(selectError);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const reset = useChatStore((s) => s.reset);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousStatusRef = useRef(status);

  // Refocus the textarea after a turn ends (FR-016).
  useEffect(() => {
    if (previousStatusRef.current === "streaming" && status !== "streaming") {
      inputRef.current?.focus();
    }
    previousStatusRef.current = status;
  }, [status]);

  const handleSelectStarter = useCallback(
    (text: string, autoSend: boolean) => {
      if (autoSend) {
        void send(text);
      } else {
        const input = inputRef.current;
        if (input) {
          input.value = text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        }
      }
    },
    [send],
  );

  return (
    <div className="@container/main flex h-[calc(100svh-5rem)] flex-col gap-3 md:h-[calc(100svh-7rem)] md:gap-4">
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-2xl md:text-3xl">Chat</h1>
          <p className="text-muted-foreground text-sm">
            Ask about prices, trends, deals, or add a new product to monitor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={messages.length === 0 && !error}
          className="gap-1"
        >
          <Plus className="size-4" />
          New chat
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border bg-card">
        <ChatThread messages={messages} status={status} error={error} onSelectStarter={handleSelectStarter} />

        <div className="border-t bg-background/40 p-3">
          <ChatInput ref={inputRef} status={status} onSend={send} onStop={stop} />
        </div>
      </div>
    </div>
  );
}
