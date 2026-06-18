# Contract: `#product-<id>` Markdown link scheme + system-prompt guidance

**Implementation note**: the scheme is a URL **fragment** (`#product-<id>`), not a
custom `product:` protocol. Streamdown's rehype-sanitize step strips hrefs whose
protocol is not allow-listed (a custom `product:` protocol → `undefined` → a
`[blocked]` span), whereas rehype-harden passes fragment (`#…`) hrefs through and
rehype-sanitize keeps them. The fragment is therefore the robust carrier.

## Producer — model prompt (chat-only)

`CHAT_SYSTEM_PROMPT` (in `apps/web/src/lib/ai/chat-config.ts`) gains guidance:

> When you reference a specific monitored product that a tool returned, write its
> name as a Markdown link `[Name](#product-<id>)`, using the exact `id` from the
> tool result. Only link products you actually retrieved this turn. Do not invent
> ids, and do not show the raw id as text.

The existing Style line — "only include URLs or IDs when the user asks" — is
adjusted so it does not contradict the sanctioned `#product-<id>` link form (the id
is encoded in the link target, never shown as literal text).

Tool descriptions are **not** changed (they are shared with IDE/stdio usage); the
linking instruction lives only in the web chat system prompt.

## Consumer — Markdown renderer

`apps/web/src/app/(main)/dashboard/chat/_components/markdown-content.tsx`:

1. `safeUrlTransform` returns fragment hrefs (incl. `#product-<id>`) unchanged
   while continuing to block `javascript:` and non-image `data:`.
2. A custom `a` component is passed to Streamdown's `components`:
   - If `href` matches `#product-<id>` **and** `<id>` is in the current message's
     retrieved-product set (`byId`), render a **button** (link-styled, keyboard
     focusable) that calls `openProduct(id)` (from `ChatProductContext`).
   - For an **unresolvable** `#product-` link, render the link's text as plain text
     with no action (FR-005 fail-safe).
   - Any other href renders as a normal anchor (`target="_blank"
     rel="noopener noreferrer"`); the href is already sanitized + hardened by
     Streamdown's rehype pipeline before our component sees it.
3. The retrieved-product set for the message is passed to `MarkdownContent` via the
   `knownProductIds` prop (computed once per assistant message in `chat-message.tsx`).

## Behavior guarantees

- An inline link can only open a product the assistant retrieved this turn.
- A hallucinated or post-hoc-deleted id never opens the wrong product; it reads as
  ordinary text (or, if clicked after deletion via the card path, yields the
  "no longer available" toast — FR-007).
- No new HTML elements are allowed; sanitization policy is otherwise unchanged.

## Tests (required)

- `#product-<knownId>` → actionable button invoking `openProduct(knownId)`.
- `#product-<unknownId>` → plain text, no button, no navigation.
- `javascript:` / non-image `data:` still neutralized.
- Ordinary `https:` links still render as anchors.
