"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isRetryable } from "@/lib/chat/chat-error-parsing";
import type { ChatError, ChatErrorCode } from "@/stores/chat/types";

interface ChatErrorBlockProps {
  error: ChatError;
  /**
   * Pass the store's `retry()` action when the page wants Retry to be
   * available. The block itself still gates retry on `isRetryable(code)`,
   * so callers can pass `retry` unconditionally.
   */
  onRetry?: () => void;
}

const ERROR_LABELS: Record<ChatErrorCode, string> = {
  validation_error: "Couldn't send that message",
  provider_config_missing: "AI provider not configured",
  mcp_unreachable: "Can't reach the data service",
  provider_error: "The AI provider hit an error",
  step_budget_exceeded: "The assistant tried too many steps",
  turn_timeout: "The assistant took too long",
  empty_response: "The assistant didn't respond",
};

/**
 * In-thread error block. Used for both pre-stream and in-stream errors;
 * the surface is informational only — the visual treatment is the same.
 *
 * Retry is offered only for retryable codes per FR-009. Non-retryable
 * codes (`validation_error`, `provider_config_missing`) hide the button
 * because retrying without user/operator action would fail identically.
 */
export function ChatErrorBlock({ error, onRetry }: ChatErrorBlockProps) {
  const showRetry = !!onRetry && isRetryable(error.code);
  return (
    <Alert variant="destructive" data-testid="chat-error-block" data-error-code={error.code}>
      <AlertTriangle className="size-4" />
      <AlertTitle>{ERROR_LABELS[error.code]}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{error.message}</span>
        {showRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1 self-start">
            <RefreshCw className="size-3" />
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
