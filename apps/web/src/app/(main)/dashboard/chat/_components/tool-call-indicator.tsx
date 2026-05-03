"use client";

import { useState } from "react";

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
 * Inline pill that names an MCP tool the assistant invoked, shows its
 * current status (FR-006 / FR-008), and expands to a JSON trace of the
 * tool's arguments and result (Phase 3.7 — high demo value).
 *
 *   running   → animated Loader2
 *   completed → Check (success color)
 *   failed    → AlertCircle (destructive color)
 *   stopped   → Square (muted color, user pressed Stop while running)
 *
 * Expansion is disabled while the tool is still `running` — args are known
 * but the result has not yet arrived, so there is nothing useful to show
 * beyond the running pill itself.
 */
export function ToolCallIndicator({ event }: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const role = event.status === "running" ? "status" : undefined;
  const canExpand = event.status !== "running";
  const detailsId = `tool-call-${event.id}-details`;

  return (
    <div
      className={cn("flex flex-col gap-1.5 self-start text-xs", expanded ? "w-full max-w-full" : "w-auto")}
      data-testid="tool-call-indicator"
      data-tool-name={event.toolName}
      data-tool-status={event.status}
      data-tool-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 self-start rounded-md border px-2 py-1",
          "text-left transition-colors",
          canExpand ? "cursor-pointer hover:bg-foreground/5" : "cursor-default",
          statusClasses(event.status),
        )}
        role={role}
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? detailsId : undefined}
        aria-label={canExpand ? `${expanded ? "Hide" : "Show"} details for ${event.toolName}` : undefined}
        disabled={!canExpand}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
      >
        <StatusIcon status={event.status} />
        <span className="font-mono text-foreground/90">{event.toolName}</span>
        <span className="text-muted-foreground">{STATUS_LABEL[event.status]}</span>
        {canExpand ? (
          <ChevronRight
            className={cn("ml-1 size-3 text-muted-foreground/70 transition-transform", expanded && "rotate-90")}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {canExpand && expanded ? (
        <div
          id={detailsId}
          data-testid="tool-call-details"
          className="overflow-hidden rounded-md border bg-background/60"
        >
          <ToolCallDetailRow label="Arguments" payload={event.args} />
          {event.status === "failed" ? (
            <ToolCallDetailRow label="Error" payload={event.errorEnvelope ?? event.result} variant="error" />
          ) : (
            <ToolCallDetailRow label="Result" payload={event.result} />
          )}
        </div>
      ) : null}
    </div>
  );
}

interface ToolCallDetailRowProps {
  label: string;
  payload: unknown;
  variant?: "default" | "error";
}

function ToolCallDetailRow({ label, payload, variant = "default" }: ToolCallDetailRowProps) {
  return (
    <div className="flex flex-col gap-1 border-b p-2 last:border-b-0">
      <span
        className={cn(
          "font-medium uppercase tracking-wide",
          variant === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px]",
          variant === "error" && "text-destructive",
        )}
      >
        {formatPayload(payload)}
      </pre>
    </div>
  );
}

function formatPayload(payload: unknown): string {
  if (payload === undefined) return "—";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
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
