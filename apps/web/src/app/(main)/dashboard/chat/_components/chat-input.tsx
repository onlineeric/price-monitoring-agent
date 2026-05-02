"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";

import { Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ConversationStatus } from "@/stores/chat/types";

/**
 * Imperative API the parent uses to drive the input — focusing it after a
 * turn ends and populating it from a starter-prompt chip. The chip path
 * cannot just write to `textarea.value`: the `<Textarea>` is a React
 * controlled input, so a direct DOM write does not update React state and
 * leaves Send disabled until the user types something else. Going through
 * `setValue` here keeps state in sync.
 */
export interface ChatInputHandle {
  focus: () => void;
  setValue: (text: string) => void;
}

interface ChatInputProps {
  status: ConversationStatus;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** Per-message character cap matching the API contract (`/api/chat`). */
const MAX_CHARS = 10_000;
/** When the typed length passes this, the live counter becomes visible. */
const COUNTER_VISIBLE_AT = 8_000;

/**
 * Multi-line input for the chat page. Owns its own value state so React
 * does not re-render the entire chat tree on every keystroke.
 *
 * Keyboard map (FR-003 / contracts §3 ChatInput):
 *   - Enter            → submit (when Send is enabled)
 *   - Cmd/Ctrl + Enter → submit (alternative)
 *   - Shift + Enter    → newline
 *   - Esc (streaming)  → Stop
 *
 * - Send is disabled when the trimmed input is empty or > MAX_CHARS, and
 *   while the conversation is `streaming` (FR-007 b/c — overlap prevention).
 * - Stop is visible iff `status === "streaming"`; always enabled (FR-008).
 * - Counter visible once length > COUNTER_VISIBLE_AT (FR-014).
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { status, onSend, onStop },
  externalRef,
) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");

  useImperativeHandle(
    externalRef,
    () => ({
      focus: () => internalRef.current?.focus(),
      setValue: (text: string) => {
        setValue(text);
        internalRef.current?.focus();
      },
    }),
    [],
  );

  const trimmedLength = value.trim().length;
  const overCap = value.length > MAX_CHARS;
  const isStreaming = status === "streaming";
  const sendDisabled = isStreaming || trimmedLength === 0 || overCap;

  const submit = useCallback(() => {
    if (sendDisabled) return;
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  }, [sendDisabled, value, onSend]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape" && isStreaming) {
        event.preventDefault();
        onStop();
        return;
      }
      if (event.key !== "Enter") return;
      if (event.shiftKey) return; // newline
      // Enter (or Cmd/Ctrl+Enter) submits.
      event.preventDefault();
      submit();
    },
    [isStreaming, onStop, submit],
  );

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="relative flex-1">
        <Textarea
          ref={internalRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Assistant is responding…" : "Ask about a product, price, or trend"}
          rows={1}
          aria-label="Chat message"
          className={cn(
            "max-h-[40vh] min-h-[3rem] resize-none pr-12",
            overCap && "border-destructive focus-visible:border-destructive",
          )}
          data-testid="chat-input-textarea"
        />
        {value.length > COUNTER_VISIBLE_AT ? (
          <div
            className={cn("absolute right-3 bottom-1 text-xs", overCap ? "text-destructive" : "text-muted-foreground")}
            aria-live="polite"
            data-testid="chat-input-counter"
          >
            {value.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </div>
        ) : null}
      </div>

      {isStreaming ? (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          onClick={onStop}
          aria-label="Stop assistant"
          data-testid="chat-stop-button"
        >
          <Square className="size-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={sendDisabled}
          aria-label="Send message"
          data-testid="chat-send-button"
        >
          <Send className="size-4" />
        </Button>
      )}
    </form>
  );
});
