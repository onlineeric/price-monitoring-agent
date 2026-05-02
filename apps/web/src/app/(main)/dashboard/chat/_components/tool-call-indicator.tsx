"use client";

import { AlertCircle, Check, ChevronRight, Loader2, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolCallEvent } from "@/stores/chat/types";

interface ToolCallIndicatorProps {
  event: ToolCallEvent;
}

const STATUS_LABEL: Record<ToolCallEvent["status"], string> = {
  running: "running",
  completed: "completed",
  failed: "failed",
  stopped: "stopped",
};

/**
 * Inline pill that names an MCP tool the assistant invoked and shows its
 * current status. Per FR-006 / FR-008:
 *
 *   running   → animated Loader2
 *   completed → Check (success color)
 *   failed    → AlertCircle (destructive color)
 *   stopped   → Square (muted color, user pressed Stop while running)
 *
 * The expansion caret is a structural placeholder for Phase 3.7, which will
 * render arguments and full results. The button is intentionally inert here.
 */
export function ToolCallIndicator({ event }: ToolCallIndicatorProps) {
  const role = event.status === "running" ? "status" : undefined;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 self-start rounded-md border px-2 py-1 text-xs",
        statusClasses(event.status),
      )}
      role={role}
      data-testid="tool-call-indicator"
      data-tool-name={event.toolName}
      data-tool-status={event.status}
    >
      <StatusIcon status={event.status} />
      <span className="font-mono text-foreground/90">{event.toolName}</span>
      <span className="text-muted-foreground">{STATUS_LABEL[event.status]}</span>
      <button
        type="button"
        aria-label="Show details"
        disabled
        className="ml-1 rounded text-muted-foreground/60 disabled:cursor-default"
      >
        <ChevronRight className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function statusClasses(status: ToolCallEvent["status"]): string {
  switch (status) {
    case "running":
      return "border-primary/30 bg-primary/5";
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "failed":
      return "border-destructive/40 bg-destructive/5 text-destructive";
    case "stopped":
      return "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
  }
}

function StatusIcon({ status }: { status: ToolCallEvent["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />;
    case "completed":
      return <Check className="size-3 text-emerald-600" aria-hidden="true" />;
    case "failed":
      return <AlertCircle className="size-3" aria-hidden="true" />;
    case "stopped":
      return <Square className="size-3" aria-hidden="true" />;
  }
}
