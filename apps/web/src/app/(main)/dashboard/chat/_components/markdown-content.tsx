"use client";

import type { ComponentPropsWithoutRef } from "react";

import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

import { useChatProduct } from "./chat-product-context";

interface MarkdownContentProps {
  text: string;
  className?: string;
  /**
   * Products this reply actually retrieved. An inline product link only becomes
   * clickable when its id is in here — otherwise it renders as plain text
   * (fail-safe, FR-005). Defaults to empty (no clickable product links).
   */
  knownProductIds?: ReadonlyMap<string, unknown>;
}

// A fragment scheme (rather than a custom `product:` protocol) so the link
// survives Streamdown's rehype-sanitize protocol allow-list; rehype-harden
// passes fragment URLs through untouched.
const PRODUCT_LINK_PREFIX = "#product-";

/** Return the product id from a `#product-<id>` href, or `null` for other hrefs. */
function parseProductHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(PRODUCT_LINK_PREFIX)) return null;
  const id = href.slice(PRODUCT_LINK_PREFIX.length).trim();
  return id.length > 0 ? id : null;
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
 * Reject `javascript:` and executable `data:` schemes; pass any other absolute
 * URL through. Relative links and fragment links (incl. our `#product-<id>`
 * markers) are returned unchanged. The fallback ("#") makes the link visible
 * but inert.
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
 *
 * Inline `product:<id>` links are rendered as buttons that open the product
 * detail dialog — but only when the id was actually retrieved this reply
 * (`knownProductIds`); unresolvable product links degrade to plain text.
 */
export function MarkdownContent({ text, className, knownProductIds }: MarkdownContentProps) {
  const { openProduct } = useChatProduct();

  function Anchor({ href, children, node: _node, ...rest }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
    const productId = parseProductHref(href);

    if (productId !== null) {
      // Fail-safe: only act on products this reply retrieved; otherwise plain text.
      if (knownProductIds?.has(productId)) {
        return (
          <button
            type="button"
            onClick={() => openProduct(productId)}
            className="cursor-pointer bg-transparent p-0 text-primary underline underline-offset-2 hover:no-underline"
          >
            {children}
          </button>
        );
      }
      return <>{children}</>;
    }

    // Non-product links: href is already sanitized + hardened by Streamdown's
    // rehype pipeline before it reaches us. Open external links in a new tab.
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }

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
        components={{ a: Anchor }}
        skipHtml
      >
        {text}
      </Streamdown>
    </div>
  );
}
