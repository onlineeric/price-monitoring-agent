# Research — Phase 0: Dashboard Chat Page (Streaming UI)

This document captures the technical decisions made before design starts.
Each entry follows: **Decision** → **Rationale** → **Alternatives**.

---

## 1. Streaming integration: SDK hook vs. store-owned reader

### Decision

Drive the chat from a **Zustand store action** that reads
`/api/chat`'s response body directly via the SDK's
`readUIMessageStream(response.body)` primitive. We do **not** use
`@ai-sdk/react`'s `useChat` hook.

### Rationale

- The store is the canonical state owner per FR-010 (state survives
  in-app navigation away and back). If the messages live inside
  `useChat`'s internal hook state, they vanish on unmount unless we
  lift the hook above the page — which would either pollute every
  dashboard sub-page or duplicate the data into Zustand anyway.
- FR-004a's history-serialization rule (drop stopped/errored
  assistant partials, but keep `tool` role messages) is a custom
  rule that does not match `useChat`'s default serializer.
  Implementing it inside the store keeps one rule in one place
  with a single unit-tested function.
- FR-009a's retry rule (drop the errored assistant turn, re-issue
  the same request) is a store-level transition. With `useChat`
  this would require mutating its internal `messages` array via
  `setMessages` then calling `regenerate()` — workable but two
  abstractions racing.
- The stopped-tool-indicator state introduced by FR-006/FR-008
  (`running` → `stopped` on user abort) is not a state `useChat`
  represents. The store can flip it in one set-call.
- We still get the SDK's battle-tested stream-format parser via
  `readUIMessageStream`, so we are not reimplementing the wire
  format — only the small reducer that maps parts → store updates.
  That reducer is ~80 lines and trivially testable with a mocked
  `ReadableStream`.

### Alternatives considered

- **`@ai-sdk/react`'s `useChat`**: Excellent for "drop in a chat box"
  use cases. Rejected because the hook owns the messages array and
  the request lifecycle; bridging that to a Zustand store creates
  two sources of truth. The store has to be the canonical owner to
  satisfy FR-010 cleanly.
- **Hand-rolled SSE/data-stream parser**: Rejected — reinvents the
  SDK's parser, adds risk, and the SDK's wire format may evolve.

---

## 2. Markdown renderer

### Decision

Use **`streamdown`** as the assistant-message Markdown renderer.

### Rationale

- **Streaming-aware**: handles partial fenced code blocks and
  unfinished bold/italic markers gracefully. As text deltas arrive,
  the rendered output does not flicker between "literal asterisks"
  and "bold" the way `react-markdown` would.
- **Sanitized by default**: ships with a safe allowed-elements list;
  scripts, iframes, inline event handlers, and `javascript:` URLs
  are blocked without extra opt-in.
- **Vercel-maintained, TypeScript-first**: same publisher as the AI
  SDK we are building against. Active maintenance, popular among
  AI SDK users — matches the project's "popular battle-tested
  package" preference.
- **Single dependency**: replaces the three-package
  `react-markdown` + `remark-gfm` + `rehype-sanitize` stack with
  one install, one import, one config surface.

We will still pass an **explicit allowed-elements list** to
`streamdown`'s configuration (even though those defaults are already
on) so the safety contract is reviewable in our code, not just in
the library's defaults.

### Alternatives considered

- **`react-markdown` + `remark-gfm` + `rehype-sanitize`**: Three
  packages, more wiring, not streaming-aware. Would require us to
  add a debounce/coalesce layer to avoid flicker. Rejected on
  complexity vs. the single-dependency alternative.
- **`marked` + DOMPurify**: lower-level, requires
  `dangerouslySetInnerHTML`. More to audit and maintain. Rejected.

---

## 3. Auto-scroll-with-user-pause pattern

### Decision

Use an **`IntersectionObserver` on a sentinel `<div>`** placed at
the bottom of the thread. While the sentinel is intersecting the
scroll container's viewport, auto-scroll on every new content
update; when the user manually scrolls up, the sentinel leaves the
viewport and auto-scroll pauses. A "Jump to latest" button surfaces
in that paused state and scrolls back to the sentinel on click.

### Rationale

- Zero scroll-position polling; no `scroll` event listener with
  manual debounce.
- Works correctly when content height changes during streaming
  (each delta does not jank the scroll position).
- Pattern is widely used (e.g. ChatGPT, Vercel's chatbot
  templates) and trivially testable.
- One observer per thread; no per-message bookkeeping.

### Alternatives considered

- **`scrollHeight` delta tracking**: fragile under viewport resize
  and fonts loading mid-stream.
- **`scroll` event listener + throttle**: works but noisy; needs
  hand-tuned thresholds for "user scrolled up".

---

## 4. In-stream error parsing

### Decision

Parse in-stream error events by:
1. Detecting parts with `type === "error"` in the v6 UI-message
   stream (the SDK exposes these via `readUIMessageStream`).
2. `JSON.parse(part.errorText)` — the `/api/chat` route emits
   `JSON.stringify({ error: { code, message } })` (see
   `apps/web/src/lib/ai/chat-errors.ts:emitChatError`).
3. Validate the parsed shape against a Zod schema we co-locate at
   `apps/web/src/lib/chat/chat-error-parsing.ts` whose `code` enum
   matches the route's `ChatErrorCode` exactly.
4. On parse failure or unknown shape, fall back to a synthetic
   `provider_error` with the original `errorText` as `message`
   (after a defensive trim/slice to keep size bounded). This is
   the only "unknown error" path; it never throws.

Pre-stream errors (HTTP 4xx/5xx) are read from the JSON response
body via the same Zod schema — the `/api/chat` route already emits
the same `{ error: { code, message } }` shape for those.

No regex anywhere.

### Rationale

- Uses `JSON.parse` + Zod for structured validation, in line with
  the constitution's "purpose-built parsers, not regex" principle.
- A single Zod schema covers both error paths (pre-stream JSON and
  in-stream `errorText` JSON), removing duplication.
- The fallback behavior keeps the UI alive even if the server ever
  emits an unrecognized error shape; we degrade to a generic
  `provider_error` rather than crashing the reducer.

### Alternatives considered

- **Re-export the Zod schema directly from
  `apps/web/src/lib/ai/chat-errors.ts`**: cleaner DRY but couples
  the client renderer to a server-side module. We will only do
  this if both files land naturally together; otherwise a small
  duplicate schema with a comment back-reference is acceptable.
- **Trust the server's JSON without validation**: rejected — the
  server is in our repo, but a forward-compatible new error code
  the client doesn't know about would crash the union narrowing.
  Validation gives us a controlled fallback.

---

## 5. Conversation id generation

### Decision

Generate `conversationId` lazily on the first `send()` after a
`reset()` (or initial store hydration) using
`crypto.randomUUID()` in the browser. The id persists for the
life of the conversation and is included in every subsequent
request body for that chat. "New chat" resets the store and
clears the id; the next send generates a new one.

### Rationale

- `crypto.randomUUID()` is built into modern browsers and Node.js;
  no dependency.
- Lazy generation keeps the empty state truly empty — opening the
  page does not yet "create a conversation" in any sense.
- The server's `/api/chat` route accepts `conversationId` as
  optional and echoes it into logs; the client side just has to
  produce a stable per-chat id, exactly what UUIDv4 gives us.

### Alternatives considered

- **`Date.now() + Math.random()` fallback**: unnecessary —
  `crypto.randomUUID()` has wide support in our target runtimes.
- **Server-issued id on first response**: rejected — turns the
  first request into a special case (`conversationId` would be
  absent) and adds an SDK-side state dependency we do not need.

---

## Notes for Phase 1

- The store action will need a `chatLogger` helper for `console.*`
  calls, so we have one place to scrub if NFR-005 ever requires
  defense in depth.
- The reducer that maps v6 UI-message parts to store updates must
  exhaustively switch on the discriminated union; unknown types
  log once via `console.warn` and are ignored. This keeps the page
  forward-compatible with any new SDK-level part type.
- We will consider colocating the Zod error schema with the
  server's `chat-errors.ts` so validation is shared. The decision
  is deferred to implementation — duplicating it with a comment
  back-reference is acceptable if cross-import causes layering
  awkwardness.
