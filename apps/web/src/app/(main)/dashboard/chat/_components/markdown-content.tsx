"use client";

import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  text: string;
  className?: string;
}

/**
 * Block-level elements we permit in assistant Markdown output.
 *
 * Streamdown ships with safe defaults (no `<script>`, `<iframe>`, `<style>`,
 * no inline event-handler attributes); we still pass an explicit list so the
 * safety contract is reviewable in our code rather than inferred from the
 * library's defaults. Per `plan.md` Technical Constraints.
 */
const ALLOWED_ELEMENTS: readonly string[] = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
  "blockquote",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
  "img",
];

const DISALLOWED_ELEMENTS: readonly string[] = [
  "script",
  "iframe",
  "style",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
];

/**
 * Reject `javascript:` and executable `data:` schemes; pass any other
 * absolute URL through. Relative links and fragment links are returned
 * unchanged. The fallback ("#") makes the link visible but inert.
 */
function safeUrlTransform(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === "") return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:")) return "#";
  if (lower.startsWith("data:") && !lower.startsWith("data:image/")) {
    return "#";
  }
  return trimmed;
}

/**
 * Sanitized Markdown renderer for assistant text. Used only on `assistant`
 * bubbles — user input is rendered as plain text (per plan.md).
 */
export function MarkdownContent({ text, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-pre:my-2 prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-3",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
        "prose-a:text-primary prose-a:underline-offset-2 hover:prose-a:underline",
        "prose-headings:mt-4 prose-headings:mb-2",
        "prose-ol:my-2 prose-p:my-2 prose-ul:my-2",
        className,
      )}
    >
      <Streamdown
        allowedElements={ALLOWED_ELEMENTS}
        disallowedElements={DISALLOWED_ELEMENTS}
        urlTransform={safeUrlTransform}
        skipHtml
      >
        {text}
      </Streamdown>
    </div>
  );
}
