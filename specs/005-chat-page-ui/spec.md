# Feature Specification: Dashboard Chat Page (Streaming UI)

**Feature Branch**: `005-chat-page-ui`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "read @docs/AI-agent-mcp-server-idea.md , we now do Phase 3.5"

## Clarifications

### Session 2026-05-02

- Q: What does the page include in the `messages` array on turn N+1 about prior turns? → A: `user` + `assistant` text + `tool` role messages reconstructed from prior tool-call/result events; stopped/errored assistant partials are dropped
- Q: What does Retry do to a failed assistant turn? → A: Drop the errored turn from the thread, re-send the same request payload that produced the failure; the new attempt streams into the same slot
- Q: How should two tabs sharing the chat page interact? → A: Independent — each tab has its own in-memory conversation; no cross-tab sync; cross-tab sharing deferred to Phase 3.6 with persistence
- Q: Which starter prompts ship in the empty state? → A: Three prompts that each exercise a different MCP tool — "Show me my monitored products" (`search_products`), "What's the price trend on my [first product]?" (`get_price_summary`), "Add this product: [paste URL]" (`add_product`)
- Q: How should Stop behave with respect to tool-call events? → A: Stop is always enabled while the request is open; a tool-call indicator that was `running` at abort time becomes a fourth `stopped` status; the whole assistant turn is marked `stopped`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask a question and watch the answer stream into the page (Priority: P1)

A user opens the Price Monitor app, navigates from the sidebar to a new
"Chat" page under the dashboard, types a natural-language question about
their monitored products (e.g. "show me my products with 'monitor' in
the name and their current price"), and presses Send. The assistant's
answer appears in the page incrementally as the model streams tokens —
the user sees the response forming in real time rather than waiting for
a full answer. The answer is rendered with proper formatting (lists,
bold, code spans where appropriate). When done, the user can type a
follow-up question and the assistant remembers the prior turns in the
same session.

**Why this priority**: This is the visible payoff of Phases 1–3.4. All
the plumbing — MCP server, MCP client, `/api/chat` streaming endpoint,
domain-restricted system prompt — only matters if a user can actually
talk to the assistant from the app. Without this UI, there is nothing
to demo and no end-to-end portfolio story. Every other Phase 3 sub-task
(history persistence in 3.6, tool-trace UI in 3.7) builds on this page.

**Independent Test**: With the dev environment running, click "Chat" in
the sidebar, send "do I have any products with 'monitor' in the name?",
and verify: (a) the assistant's reply streams in token-by-token,
(b) the reply contains real product names from the database, (c) sending
a follow-up like "what's the price trend on the first one?" produces a
coherent answer that uses the prior turn's context.

**Acceptance Scenarios**:

1. **Given** the user is on `/dashboard/chat` with no prior conversation,
   **When** they type a question and press Send (or Enter), **Then** the
   message appears immediately as a user bubble and an assistant bubble
   begins streaming a response below it within a few seconds.
2. **Given** the assistant has finished a turn, **When** the user sends
   a follow-up message, **Then** the new request includes the prior
   turns (so the assistant can reference them) and the new answer
   streams into a third bubble below the existing exchange.
3. **Given** the assistant returns markdown content (bullet list, bold
   text, inline code, fenced code block), **When** the response renders,
   **Then** the markdown is displayed as formatted output, not as raw
   markdown source, and rendered HTML is sanitized so a malicious tool
   result cannot inject executable script or unsafe links.
4. **Given** the conversation has grown long enough that earlier messages
   scroll out of view, **When** new content streams in, **Then** the
   view auto-scrolls to keep the latest content visible — unless the
   user has manually scrolled up to read history, in which case
   auto-scroll pauses and a "Jump to latest" affordance appears.

---

### User Story 2 - See when the assistant is using a tool (Priority: P1)

While the assistant is answering, the user can see when it consults the
database via an MCP tool. Each tool call surfaces in the chat thread as
a compact, distinguishable element that names the tool (e.g.
`search_products`), shows it is in progress while the call runs, and
updates to a completed/failed state once the tool returns. This gives
the user (and the portfolio reviewer) confidence that the answer is
grounded in real data, not hallucinated.

**Why this priority**: The headline differentiator of this project over
"a generic chatbot" is that answers are backed by tool calls against a
real database. If those tool calls are invisible, the demo collapses to
"chatbot says words" — indistinguishable from any other LLM front-end.
Surfacing tool calls in the UI is what makes the MCP integration
legible. Phase 3.7 will deepen this into a full trace (arguments,
results, timing); Phase 3.5 must already show enough that the user can
tell a tool was called.

**Independent Test**: Send a question that requires a tool call ("what
products am I monitoring?"), and verify a tool-call indicator appears
inline within the assistant's response, naming the tool that was
invoked, with a visible "in progress" state during the call and a
"completed" state once it returns.

**Acceptance Scenarios**:

1. **Given** the assistant decides to call `search_products`, **When**
   the streamed response includes the tool-call event, **Then** a
   tool-call indicator renders inline in the assistant turn showing the
   tool name and a "running" visual state.
2. **Given** the tool returns successfully, **When** the result event
   arrives, **Then** the indicator transitions to a "completed" state
   and the assistant continues streaming its natural-language reply
   below it.
3. **Given** a tool call fails (the API surfaces a structured tool
   error from Phase 2.6), **When** the model receives the error and
   continues the turn, **Then** the indicator shows a "failed" state
   and the assistant's continuing text is rendered as usual — the turn
   is not aborted by a single tool failure.
4. **Given** the assistant calls more than one tool in a single turn
   (e.g. `search_products` then `get_price_summary`), **When** each
   call happens, **Then** each appears as its own indicator in the
   order it was invoked.

---

### User Story 3 - Robust error and loading UX so failures never look like a hung page (Priority: P2)

The page handles every documented `/api/chat` error mode in a way the
user can recognize and recover from: a clear loading state while the
first chunk is in flight, a specific error banner when the request is
rejected, an in-thread error message when the stream fails partway,
and a Stop button so the user can cancel a streaming turn. The user
should never face a frozen page or a cryptic "something went wrong"
toast — even on the first cold-boot request, when the MCP subprocess
is still spawning and first-chunk latency is up to 15 seconds.

**Why this priority**: P1 covers the happy path; P2 makes the page
usable when something inevitably goes wrong. The `/api/chat` endpoint
already produces seven distinct error codes (`validation_error`,
`provider_config_missing`, `mcp_unreachable`, `provider_error`,
`step_budget_exceeded`, `turn_timeout`, `empty_response`) and the UI
must render them legibly. Without this, the first time a stakeholder
hits a cold MCP server, the demo looks broken rather than gracefully
degraded.

**Independent Test**: Force each failure mode and verify the UI's
response — stop the MCP server (`mcp_unreachable`), unset the provider
API key (`provider_config_missing`), send an empty body via DevTools
(`validation_error`), and rapidly send while one is streaming (Send
button is disabled). For each, the UI must show a recognizable error
state and remain interactive.

**Acceptance Scenarios**:

1. **Given** the user has just sent a message, **When** the request is
   in flight and no chunks have arrived yet, **Then** an assistant
   "thinking" placeholder is visible (e.g. shimmer / dots) within
   100ms, and remains visible until the first text or tool-call chunk.
2. **Given** the endpoint returns a pre-stream JSON error
   (`mcp_unreachable`, `provider_config_missing`, `validation_error`),
   **When** the UI receives it, **Then** the page renders a
   non-dismissable error block in place of the assistant turn that
   names the failure category in plain language and offers a "Retry"
   action where retry is meaningful.
3. **Given** the stream begins but terminates with an in-stream error
   event (`provider_error`, `step_budget_exceeded`, `turn_timeout`,
   `empty_response`), **When** the error event arrives, **Then** the
   partial assistant turn is preserved, the error is appended inline
   in a recognizable error style, and the input regains focus so the
   user can try again.
4. **Given** an assistant turn is currently streaming, **When** the
   user clicks Stop, **Then** the in-flight request is aborted client
   side, the streamed-so-far content remains in the thread marked as
   "stopped", and the input becomes interactive again.
5. **Given** an assistant turn is currently streaming, **When** the
   user types and presses Send, **Then** the new send is blocked
   (Send button disabled, Enter ignored) until the current turn
   completes or the user clicks Stop — preventing two overlapping
   turns on the same conversation.
6. **Given** the user sends a message larger than the API limit
   (10,000 characters), **When** they press Send, **Then** the UI
   rejects the send client-side with an inline character-count
   warning and never makes the request, matching the API's
   validation rule.

---

### Edge Cases

- **Empty conversation on first visit**: The page should show a brief
  empty state explaining what the assistant can help with (the
  domain-restriction hint from the system prompt) and offer 2–3
  one-click example prompts the user can send to bootstrap a session.
- **Off-topic prompt**: When the user asks something off-topic, the
  assistant's domain-restriction reply (already authored in Phase 3.4)
  streams in like any other answer. No special UI treatment is needed
  — the existing assistant-bubble render handles it.
- **Cold-boot first request**: On the first request after a server
  start, first-chunk latency can reach 15s while the MCP subprocess
  spawns (`/api/chat` SC-002). The "thinking" placeholder must remain
  visible and reassuring for the full window — no client-side timeout
  shorter than the API's own 60s per-turn limit.
- **Conversation resets**: A "New chat" control clears the in-memory
  thread and starts a fresh `conversationId`. Phase 3.6 will add
  database-backed persistence; until then, a full page reload also
  resets the conversation, and this is acceptable.
- **In-app navigation away and back**: If the user clicks another
  sidebar item while a turn is streaming and then returns to the chat
  page within the same session, the ongoing/recent thread should
  still be visible (the chat state lives in a Zustand store at the
  app shell, not just in component state). A full reload is allowed
  to drop it (persistence is Phase 3.6).
- **Markdown safety**: Assistant content (and any tool-result snippets
  the model echoes back) MUST be rendered through a sanitizing
  markdown pipeline so that script tags, `javascript:` URLs, and
  unsafe HTML attributes cannot execute. The model is not trusted as
  a source of HTML.
- **Network blip mid-stream**: If the SSE/data-stream connection drops
  mid-turn (browser offline, server crash), the UI surfaces an
  in-thread error with a "Retry" affordance and the input becomes
  interactive again rather than spinning forever.
- **Very long single message from the user**: A character counter
  appears once the input passes 80% of the 10,000-character cap; the
  Send button disables once the cap is exceeded.
- **Mobile / narrow viewport**: The page must remain usable down to
  the smallest sidebar-collapsed dashboard layout — no horizontal
  scroll on mobile, the input bar pinned to the bottom of the
  viewport, and message bubbles wrapping naturally.
- **Tool-call indicator with no tools published**: If the MCP server
  publishes zero tools at request time, the API degrades to text-only
  chat (Phase 3.3 SC). The page just renders the streamed text
  without any tool-call indicators — no error UI is required for this
  case from the user's perspective.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a chat page at `/dashboard/chat`
  reachable from the existing dashboard sidebar via a new sidebar
  entry labeled "Chat" (or equivalent) using the same
  layout/styling/sidebar pattern as the other dashboard sub-pages.
- **FR-002**: The page MUST present a single conversation thread laid
  out as an ordered list of message bubbles distinguishing the user's
  turns from the assistant's turns visually (alignment, color/role
  treatment) and MUST support the conversation growing beyond
  viewport height with a scrollable thread region.
- **FR-003**: The page MUST provide a message input control at the
  bottom of the page that accepts multi-line input, sends on Enter,
  inserts a newline on Shift+Enter, and exposes a Send button. The
  input MUST be disabled while a turn is in flight (see FR-007).
- **FR-004**: On Send, the page MUST POST the conversation history to
  `/api/chat` using the contract documented for the streaming
  endpoint (Vercel AI SDK v6 UI-message-stream protocol, request
  body shape per spec 004) and consume the streamed response so that
  text deltas render incrementally into the assistant bubble as they
  arrive.
- **FR-004a**: When constructing the request body for turn N+1, the
  page MUST serialize prior turns as: every completed `user` message,
  every completed `assistant` text message, AND a `tool` role message
  for every tool-call/result event observed during prior turns
  (preserving original ordering). Assistant partials from turns that
  ended in `stopped` or `errored` state MUST be dropped from the
  request and MUST NOT contribute any `tool` messages, so the model
  never sees half-finished prior reasoning. The full-fidelity tool
  history is what lets the model recall what it already retrieved
  without redundant tool calls on follow-ups.
- **FR-005**: The page MUST render assistant text content as Markdown
  through a sanitizing renderer that strips/blocks script execution,
  unsafe schemes (`javascript:`, `data:` for executable types),
  inline event handlers, and unknown HTML — supporting at minimum:
  paragraphs, line breaks, bold, italics, ordered and unordered
  lists, inline code, fenced code blocks, blockquotes, and links.
- **FR-006**: The page MUST surface tool-call events from the stream
  inline within the assistant turn as compact indicators that name
  the tool (`tool name` from the stream event) and show a status
  (`running` while in flight, `completed` once the result arrives,
  `failed` if the tool's structured error envelope is delivered,
  `stopped` if the user clicked Stop while the call was running —
  see FR-008).
  Detailed argument/result expansion is out of scope for this phase
  and is delivered by Phase 3.7; the indicator MUST leave structural
  room for that future expansion (e.g. a placeholder caret) without
  blocking it.
- **FR-007**: While a turn is in flight (request sent, no terminal
  event received), the page MUST: (a) show a "thinking" placeholder
  in the streaming assistant bubble until the first chunk arrives,
  (b) disable the Send button and ignore plain Enter on the input,
  (c) display a visible Stop button.
- **FR-008**: Clicking Stop MUST abort the in-flight request from the
  client side (`AbortController.abort()` against the chat fetch),
  preserve any text and tool-call indicators streamed up to that
  moment as a finalized assistant turn marked `stopped`, clear the
  in-flight state, and re-enable the input. Stop MUST be enabled
  for the entire duration the request is open — including the
  window between a `tool-call` event and its `tool-result`. Any
  tool-call indicator that was in `running` state when Stop is
  pressed MUST transition to a `stopped` indicator state (see
  FR-006); already-`completed` indicators stay `completed`.
- **FR-009**: The page MUST recognize and render every error code
  documented by `/api/chat` (`validation_error`,
  `provider_config_missing`, `mcp_unreachable`, `provider_error`,
  `step_budget_exceeded`, `turn_timeout`, `empty_response`):
  pre-stream errors (HTTP 4xx/5xx JSON body) MUST be rendered as a
  thread-level error block in place of the failed assistant turn,
  while in-stream error events MUST be rendered inline at the end
  of whatever partial content arrived. Each error block MUST: name
  the category in plain language, never expose raw stack traces or
  env var names beyond what the API already redacts, and offer a
  Retry affordance where retry is meaningful (provider/network
  errors; retry is intentionally NOT offered for `validation_error`
  or `provider_config_missing` because retrying without the user
  fixing input/env will fail identically).
- **FR-009a**: Clicking Retry on a failed/errored assistant turn MUST:
  (a) drop that errored turn from the thread, (b) re-send the same
  `/api/chat` request body that produced the failure, (c) stream the
  new attempt into the slot the errored turn previously occupied. The
  retry request MUST NOT include the dropped errored partial in its
  `messages` (consistent with FR-004a).
- **FR-010**: The page MUST manage active-conversation client state
  (messages, in-flight status, pending error, conversation id) in a
  dedicated client store (Zustand) scoped to the chat page, so that
  in-app navigation away and back within the same session preserves
  the visible thread without re-issuing the last request. The store
  MUST expose, at minimum: `messages`, `status` (`idle` |
  `streaming` | `errored`), `error`, `conversationId`, `send(input)`,
  `stop()`, and `reset()`. The store MUST be in-memory only and
  per-tab — no `localStorage` persistence, no `BroadcastChannel`
  sync, no other cross-tab coordination. Two tabs open on the chat
  page MUST therefore hold independent conversations; cross-tab
  sharing is deferred to Phase 3.6 alongside server-side persistence.
- **FR-011**: The page MUST generate a fresh `conversationId` on
  first message of a new chat (e.g. via `crypto.randomUUID()`),
  include it in every subsequent request body for the same chat (so
  server logs group correctly), and replace it when the user starts
  a new chat via FR-012.
- **FR-012**: The page MUST provide a "New chat" control that clears
  the in-memory thread, error state, and conversation id, returning
  the page to its empty state.
- **FR-013**: The empty state MUST display a short hint about what
  the assistant helps with (products, prices, trends, deals, adding
  products) and exactly three one-click starter prompts that, when
  clicked, populate the input and immediately send. The three
  prompts MUST each exercise a different MCP tool so the empty state
  itself functions as a tool-call demo:
  - "Show me my monitored products." (exercises `search_products`)
  - "What's the price trend on my [first product]?" (exercises
    `get_price_summary`; `[first product]` is a placeholder the user
    edits before sending or, where the page can resolve it locally,
    is auto-filled with the first product's name)
  - "Add this product: [paste URL]" (exercises `add_product`;
    `[paste URL]` is a placeholder the user replaces before send,
    so this third chip behaves slightly differently — clicking it
    populates the input but does NOT auto-send until the user has
    pasted a URL).
- **FR-014**: The page MUST show a live character counter on the
  input once the typed content exceeds 80% of the 10,000-character
  per-message API limit and MUST disable Send when the input
  exceeds the cap, so the request is never made — preventing a
  guaranteed 400 response.
- **FR-015**: The thread MUST auto-scroll to the bottom on new
  content during streaming, except when the user has manually
  scrolled up to read history; in that case auto-scroll MUST pause
  and a "Jump to latest" button MUST become available, restoring
  auto-scroll on click.
- **FR-016**: The page MUST be accessible: messages and tool-call
  indicators MUST have appropriate ARIA roles and labels, the input
  MUST be reachable by keyboard, focus MUST return to the input
  after a turn completes or errors, and screen readers MUST be
  informed of the streaming assistant region as a polite live
  region.

### Non-Functional Requirements

- **NFR-001**: The page MUST render an interactive, focused input
  within 200ms of route navigation under a warm dev server — no
  blocking server-side data fetch is permitted on first paint
  (consistent with the page being a fully client-side experience).
- **NFR-002**: A "thinking" placeholder MUST appear within 100ms of
  Send so the user perceives an immediate acknowledgement even when
  the first chunk has not yet arrived.
- **NFR-003**: The page MUST render correctly on viewport widths
  from 360px (mobile) to ≥1920px without horizontal scrolling and
  without the input bar overlapping the last visible message.
- **NFR-004**: Markdown rendering of a single assistant message up
  to 10,000 characters MUST not exceed 50ms on a mid-range laptop,
  so streaming feels smooth even for code-heavy answers.
- **NFR-005**: No client-side log line, console message, error
  toast, or DOM text MAY include raw provider API keys, environment
  variable values, or absolute filesystem paths — the API already
  scrubs these (`scrubMessage` in `chat-errors.ts`); the UI MUST
  NOT re-introduce them by, for example, dumping the full fetch
  error object into a toast.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/web` only. New page directory
  `apps/web/src/app/(main)/dashboard/chat/` with `page.tsx` and a
  local `_components/` folder for chat-specific UI; new Zustand
  store under `apps/web/src/stores/chat/` (next to the existing
  `stores/preferences/` store); update to
  `apps/web/src/navigation/sidebar/sidebar-items.ts` to add the
  Chat entry. No changes to `apps/worker`, `packages/db`,
  `apps/mcp-server/`, or shared infrastructure are required. The
  `/api/chat` route from spec 004 is consumed unchanged.
- **Data and Contracts Impact**: No database schema changes, no
  BullMQ queue changes, no new HTTP endpoints, no MCP tool
  changes. The page consumes the existing `/api/chat` contract;
  the only contract change in this feature is the in-memory
  Zustand store shape (FR-010) which is internal to `apps/web`.
- **Operational Impact**:
  - No new environment variables. The page calls `/api/chat`
    same-origin, so no `NEXT_PUBLIC_*` config is needed.
  - No new dependencies are required for streaming itself —
    `ai@^6` is already installed and exposes a v6-compatible
    `useChat` hook against the data-stream protocol the API
    emits.
  - One new dependency may be introduced for the Markdown
    renderer (e.g. `react-markdown` + `remark-gfm` +
    `rehype-sanitize`, or `streamdown`); selection happens in
    the plan, not the spec. Whatever is chosen MUST default to
    safe HTML (sanitized) without requiring extra opt-in
    configuration to be safe.
  - Deployment story is unchanged: the existing web container
    ships the new page; no infrastructure work required.
  - Graceful shutdown: client-side only. Closing the tab triggers
    `AbortController.abort()` via the browser's lifecycle, which
    `/api/chat` already handles (the API aborts the model stream
    and any in-flight tool call).
- **Verification Notes**:
  - User Story 1 (streaming + multi-turn + markdown) needs an
    automated component test using `@testing-library/react` that
    drives a mocked stream into the chat component and asserts
    incremental rendering, plus one manual end-to-end pass against
    the live API.
  - User Story 2 (tool-call indicators) needs an automated test
    that feeds tool-call/tool-result chunks through the mocked
    stream and asserts the running → completed/failed states
    render.
  - User Story 3 (error and stop UX) needs automated tests for
    each documented error code, the Stop button, and the
    overlap-prevention rule (FR-007b/c).
  - Accessibility checks (FR-016) are validated in a single
    manual pass with a screen reader and a Lighthouse a11y run.

### Key Entities

- **ConversationSession**: The active chat the user is interacting
  with. Holds an id, an ordered list of `DisplayedMessage`s, the
  current status (`idle` | `streaming` | `errored`), and the
  current error (if any). Lives only in the client Zustand store
  for this phase; database persistence is Phase 3.6.
- **DisplayedMessage**: One turn rendered in the thread. Attributes:
  role (`user` | `assistant`), text content (Markdown for
  assistant), an ordered list of `ToolCallEvent`s embedded in the
  turn (assistant only), and a state (`streaming` | `complete` |
  `stopped` | `errored`). The tool list grows as the stream emits
  tool-call/tool-result events; the text grows as text deltas
  arrive.
- **ToolCallEvent**: One tool invocation observed in the stream.
  Attributes: tool name (e.g. `search_products`), status
  (`running` | `completed` | `failed` | `stopped`), and a
  placeholder for the detailed args/result payload that Phase 3.7
  will render. `failed` indicators carry the `{ code, message }`
  envelope from Phase 2.6; `stopped` indicators are reached only
  via the Stop control (FR-008) and never via the stream itself.
- **ChatError**: A pre-stream or in-stream error surfaced to the
  user. Attributes: `code` (one of the seven documented error
  codes), `message` (already scrubbed by the API), and a
  `retryable` flag derived from the code (true for
  `provider_error`, `mcp_unreachable`, `turn_timeout`,
  `step_budget_exceeded`, `empty_response`; false for
  `validation_error`, `provider_config_missing`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can send a question that requires a tool call
  and see the streamed answer with at least one visible tool-call
  indicator in 100% of acceptance runs against the seeded dev
  database.
- **SC-002**: The "thinking" placeholder appears within 100ms of
  Send (NFR-002) and the first streamed text chunk renders into
  the assistant bubble within 4 seconds on a warm endpoint and
  within 16 seconds on a cold-boot endpoint — leaving 1s of
  client-side budget on top of the API's 3s warm / 15s cold
  targets.
- **SC-003**: Every one of the seven `/api/chat` error codes is
  rendered as a recognizable, non-cryptic UI element in at least
  one automated test, and the Retry affordance behaves per FR-009
  (offered on retryable codes, omitted on the two non-retryable
  ones).
- **SC-004**: A user attempting to send a second message while a
  turn is streaming is prevented from doing so 100% of the time —
  no duplicated overlapping requests are observed during
  acceptance testing.
- **SC-005**: The page is reachable from the dashboard sidebar
  with no broken-link or 404 states, and visually matches the
  existing dashboard pages' layout chrome (sidebar
  collapsed/expanded, header, content padding) with no regression
  detected by manual comparison.
- **SC-006**: Phase 3.6 (history persistence) and Phase 3.7
  (tool-call trace expansion) are unblocked by the structures this
  spec introduces — both can plug into the Zustand store and
  tool-call-indicator structural slots without rewriting the chat
  page.

## Assumptions

- The chat experience remains **single-user / unauthenticated** in
  this phase, consistent with the rest of `apps/web` and with spec
  004's posture. The page does not render any user identity,
  per-user history, or auth state.
- **Conversation persistence is out of scope.** The active thread
  lives only in the Zustand store; full page reloads reset it.
  Phase 3.6 introduces server-side persistence and history reload;
  this spec only ensures the store shape will accept that layer
  without breaking changes.
- **Tool-call display in this phase is intentionally minimal**
  (name + status + structural placeholder for expansion). Phase
  3.7 owns rich rendering of arguments, results, and timings; the
  placeholder slot in the indicator is the integration point for
  that work.
- The Markdown renderer is chosen during planning and defaults to
  safe HTML without opt-in configuration. The model and any echoed
  tool result are treated as untrusted HTML sources.
- The Vercel AI SDK v6 `useChat` hook (or its v6-equivalent API)
  consumes the data-stream protocol the `/api/chat` endpoint
  emits; this feature does not introduce a custom wire format or
  reimplement the stream parser.
- Server-side conversation history reconstruction, message
  signing, and rate limiting are deferred to Phase 6.6 alongside
  the auth work — the same trade-off recorded in spec 004.
- Logs written from the client are plain `console.*` calls; full
  client-side tracing is Phase 6.3.
