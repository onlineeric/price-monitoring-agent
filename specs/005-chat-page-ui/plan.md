# Implementation Plan: Dashboard Chat Page (Streaming UI)

**Branch**: `005-chat-page-ui` | **Date**: 2026-05-02 | **Spec**: [/home/onlineeric/repos/price-monitoring-agent/specs/005-chat-page-ui/spec.md](/home/onlineeric/repos/price-monitoring-agent/specs/005-chat-page-ui/spec.md)
**Input**: Feature specification from `/specs/005-chat-page-ui/spec.md`

## Summary

Build a dedicated chat page at `/dashboard/chat` that consumes the existing
`POST /api/chat` Vercel-AI-SDK-v6 UI-message-stream contract from spec 004
and renders streamed assistant turns with markdown formatting and inline
tool-call indicators. Active conversation state lives in a single in-memory
Zustand store at module scope so in-app navigation away and back preserves
the thread (per FR-010), while still satisfying "no cross-tab sharing" by
running the store per browser tab. The page provides Send/Stop, an empty
state with three tool-exercising starter prompts, retry on errored turns
(FR-009a), per-message character validation matching the API's 10,000 char
cap, and recognizable rendering of every documented `/api/chat` error code.

The chat orchestration is implemented directly against the SDK's
`readUIMessageStream(response.body)` primitive from inside a Zustand store
action — not via the `useChat` React hook — because the store is the
canonical state owner and we need full control of history serialization
(FR-004a), retry semantics (FR-009a), `conversationId` lifecycle (FR-011),
and stopped-tool-call indicator state (FR-006/FR-008). This keeps a single
source of truth, avoids hook-vs-store coordination bugs, and uses the
SDK's battle-tested stream parser without inheriting its higher-level state
ownership.

Markdown rendering uses `streamdown` (Vercel-maintained, sanitized-by-default,
streaming-aware) so that partial fenced code blocks and unfinished bold/italic
markers render gracefully as text deltas arrive. No new server endpoint, no
schema changes, no new env vars.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16 App Router, React 19, browser runtime (client component) + Node.js runtime (the server route is unchanged)
**Primary Dependencies**: `ai@^6` (already installed — `readUIMessageStream`), `zustand@^5` (already installed), `streamdown` (new — Markdown renderer with safe defaults), `lucide-react` (already installed — icons), Tailwind CSS v4 + Shadcn UI primitives (already installed — Card, Button, Textarea, Alert, ScrollArea, Skeleton, Tooltip)
**Storage**: None new. Active conversation lives in an in-memory Zustand store per tab; full page reload resets it. Database persistence is Phase 3.6 and out of scope here.
**Testing**: Vitest in `apps/web/` with `@testing-library/react` and `@testing-library/user-event` (already installed). Streaming is exercised by feeding a mocked `ReadableStream` of v6 UI-message parts into the store action; no real network calls in tests.
**Target Platform**: Modern browsers (Chrome/Edge/Firefox/Safari current); responsive from 360px viewport upward, matching the rest of `apps/web`.
**Project Type**: Monorepo web application extension — new dashboard sub-page + page-scoped client store, both inside `apps/web`.
**Performance Goals**: First "thinking" placeholder ≤100ms after Send (NFR-002); first text chunk ≤4s warm / ≤16s cold (SC-002); markdown render of a 10k-char message ≤50ms (NFR-004); page interactive ≤200ms after route navigation (NFR-001).
**Constraints**: Sanitized markdown rendering (FR-005); 10,000-char per-message cap (FR-014); single in-flight turn per tab (FR-007 b/c); no `localStorage` / `BroadcastChannel` (FR-010); accessible live region + ARIA (FR-016); no leakage of API keys / paths in client logs or DOM (NFR-005); no changes to `apps/worker`, `packages/db`, `apps/mcp-server/`, or the `/api/chat` route.
**Scale/Scope**: One new dashboard page (`/dashboard/chat`) with ~6 component files, one Zustand store with one orchestration action, one streaming utility module, one sidebar entry update, one new dependency (`streamdown`), four Vitest test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Architecture Fit**: Pass. All new code lives in `apps/web` — page under `apps/web/src/app/(main)/dashboard/chat/`, store under `apps/web/src/stores/chat/`, utility under `apps/web/src/lib/chat/`. No new package, no new app, no new runtime. Reuses the existing `/api/chat` route from spec 004 unchanged.
- **Typed Maintainability**: Pass. Every store action is typed; every stream-part handler is exhaustive on a TypeScript discriminated union; markdown is parsed and sanitized by `streamdown` (not regex); the in-stream error envelope is parsed via `JSON.parse` of the SDK's `errorText` field, again not regex. Components are small and single-responsibility (`ChatThread`, `ChatMessage`, `ToolCallIndicator`, `ChatInput`, `ChatEmptyState`, `ChatErrorBlock`, `MarkdownContent`).
- **Data Safety**: Pass. The page does no direct database access. The MCP tools called downstream of `/api/chat` already use the Drizzle query builder. No raw SQL, no schema change, no migration.
- **Verification Plan**: Pass. US1 (streaming + multi-turn + markdown) → component test that drives a mocked v6 UI-message stream into the store and asserts incremental render. US2 (tool indicators) → store test for state machine + a component test asserting indicator status transitions. US3 (error / stop / overlap) → one test per error code, one test for Stop, one test for the overlap-prevention rule. Manual: a quickstart end-to-end pass against the live `/api/chat` with the dev DB seeded.
- **Operational Readiness**: Pass. No new environment variables. One new client dependency (`streamdown`) is added to `apps/web/package.json` only; no infrastructure work, no new secret. The page relies on the singleton MCP client already managed by the existing `/api/chat` route. Client-side errors are logged with `console.error` for now (full tracing is Phase 6.3); errors surfaced in the DOM are scrubbed by the API before they reach us (NFR-005). Documentation updated: a quickstart for the new page is added under this spec; CLAUDE.md is refreshed by `/speckit.claude-cleanup` to drop the just-shipped 004 entry and add this feature.

## Project Structure

### Documentation (this feature)

```text
specs/005-chat-page-ui/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions: SDK hook vs store, markdown lib, auto-scroll, error-event parsing)
├── data-model.md        # Phase 1 output (Zustand store shape, message/tool/error entities, state machine)
├── quickstart.md        # Phase 1 output (run dev, click Chat, send 3 starter prompts, induce errors)
├── contracts/
│   └── chat-ui.md       # Page → store → /api/chat contract; store action signatures; component prop contracts
├── checklists/
│   └── requirements.md  # (pre-existing)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/app/(main)/dashboard/chat/
├── page.tsx                                     # Server component — renders <ChatPageClient /> only
└── _components/
    ├── chat-page-client.tsx                     # Top-level "use client" — wires store, layout chrome, header
    ├── chat-thread.tsx                          # Scrollable message list + auto-scroll-with-pause + "Jump to latest"
    ├── chat-message.tsx                         # One DisplayedMessage bubble (user vs assistant, state-aware)
    ├── tool-call-indicator.tsx                  # Inline running/completed/failed/stopped pill (Phase 3.7 expansion slot)
    ├── chat-input.tsx                           # Textarea + Send/Stop, Enter/Shift+Enter, char counter, cap enforcement
    ├── chat-empty-state.tsx                     # Hint + 3 starter-prompt chips (FR-013)
    ├── chat-error-block.tsx                     # Renders ChatError as an in-thread block, Retry where retryable
    └── markdown-content.tsx                     # <Streamdown> wrapper with our typography classes + safety defaults

apps/web/src/stores/chat/
├── chat-store.ts                                # Module-level Zustand store (per-tab singleton); send/stop/retry/reset
├── chat-stream.ts                               # Reads /api/chat response body via readUIMessageStream; reduces parts → store updates
├── chat-history.ts                              # serializeHistoryForApi() — FR-004a rule (drops stopped/errored, keeps tool roles)
└── types.ts                                     # ConversationStatus, DisplayedMessage, ToolCallEvent, ChatError, store state shape

apps/web/src/lib/chat/
├── chat-error-parsing.ts                        # parseChatErrorPayload() — extracts {code,message} from v6 error part errorText (or HTTP body); maps unknown shapes to provider_error
└── auto-scroll.ts                               # useAutoScrollToBottom() — IntersectionObserver-based pause/resume

apps/web/src/navigation/sidebar/
└── sidebar-items.ts                             # +1 entry: "Chat" → /dashboard/chat (icon: MessageSquare from lucide-react)

apps/web/src/test/dashboard/chat/
├── chat-page.streaming.test.tsx                 # US1 — streamed text deltas render into bubble, multi-turn keeps history
├── chat-page.tools.test.tsx                     # US2 — tool-call/tool-result/tool-error/stopped state transitions
├── chat-page.errors.test.tsx                    # US3 — every error code renders a recognizable block, Retry behavior, Stop button, overlap prevention
├── chat-store.test.ts                           # Pure store test — send/stop/retry/reset, history serialization (FR-004a), conversationId lifecycle
├── chat-history.test.ts                         # serializeHistoryForApi: drops stopped/errored, keeps tool messages, preserves order
├── chat-error-parsing.test.ts                   # Parses good payloads, unknown shapes, malformed JSON, HTTP error bodies
└── markdown-content.test.tsx                    # Sanitization: scripts blocked, javascript: links blocked, gfm tables/code/lists render
```

**Structure Decision**: All UI lives under the App Router segment `(main)/dashboard/chat/` so it inherits the existing dashboard layout (sidebar, header, theming). Component files are colocated under `_components/` to match the convention used by `dashboard/products/_components/` and `dashboard/send-report/_components/`. Store and stream-handling code live in `apps/web/src/stores/chat/` and `apps/web/src/lib/chat/` so the store can be imported from anywhere in `apps/web` (e.g. a future global "chat with AI" launcher) without touching dashboard-page internals. The store is a module-level Zustand singleton (created with `create()` from `zustand`, not the vanilla-store + provider pattern preferences uses) because (a) we want one instance per tab and exactly one in this app, (b) the chat page is the only consumer for now, (c) it gives us module-scope persistence across in-app navigation for free without lifting a provider above the layout.

## Phases

### Phase 0: Research

Decisions to capture in `research.md`:

1. **Streaming integration: SDK hook vs. store-owned reader** — pick `readUIMessageStream` driven from a Zustand store action over `@ai-sdk/react`'s `useChat`. Rationale: store is the canonical state owner so in-app navigation persistence (FR-010), custom history serialization (FR-004a), retry semantics (FR-009a), and stopped-indicator state (FR-006) work without coordinating two sources of truth. Trade-off: we write a small reducer (~80 lines) for v6 UI-message parts. Alternatives considered: `useChat` (hook owns state — fights FR-010 unless lifted into context, then duplicates Zustand), full custom SSE parser (rejected — reinvents the SDK's parser).
2. **Markdown renderer** — choose `streamdown` over `react-markdown` + `remark-gfm` + `rehype-sanitize`. Rationale: streaming-aware (no flicker on partial fences/bold), sanitized by default with an explicit allowed-elements list, Vercel-maintained, TypeScript-first, single dependency vs. three. Honors the "popular battle-tested package" preference. Alternatives: `react-markdown` stack (more building blocks but more wiring and not streaming-aware), `marked` + DOMPurify (lower-level; would require us to render HTML through `dangerouslySetInnerHTML`, which is a larger surface to audit).
3. **Auto-scroll-with-user-pause pattern** — use an `IntersectionObserver` on a sentinel `<div>` at the thread bottom. While the sentinel is intersecting the viewport, auto-scroll on new content; when the user scrolls up (sentinel leaves the viewport), pause and surface a "Jump to latest" button that scrolls to the sentinel on click. Rationale: zero scroll-position polling, no jank, robust on virtualized future thread. Alternatives considered: `scrollHeight`-delta tracking (fragile on resize), `scroll` event listener (noisy, requires throttling).
4. **In-stream error parsing** — the route emits errors as `writer.write({ type: "error", errorText: JSON.stringify({error: {code, message}}) })`. The store reducer detects parts with `type === "error"`, JSON-parses `errorText`, and validates the payload against a small Zod schema (re-exported from `apps/web/src/lib/ai/chat-errors.ts` if practical, otherwise duplicated locally with a comment pointing back). On parse failure or unknown shape, fall back to a synthetic `provider_error` with a generic message. No regex.
5. **Conversation id generation** — `crypto.randomUUID()` (built-in, no dep, available in modern browsers and SSR). Generated lazily on the first `send()` call after a `reset()` or initial mount, then echoed on every subsequent request body for that chat. New chat → new id.

**Output**: `research.md` with the five decisions above, each with Decision / Rationale / Alternatives.

### Phase 1: Design & Contracts

- `data-model.md`: full TypeScript-shape sketches for the store state, `DisplayedMessage`, `ToolCallEvent`, `ChatError`, the v6 UI-message-part discriminated union we consume, and the explicit state machine (`idle → streaming → idle | errored`; per-message `streaming → complete | stopped | errored`; per-tool `running → completed | failed | stopped`).
- `contracts/chat-ui.md`: store action signatures (`send(text)`, `stop()`, `retry()`, `reset()`), component-prop contracts for each `_components/*` file, the FR-004a serialization rule expressed as pseudocode, the v6 UI-message-stream parts the reducer must handle, the seven error codes the UI must render and which are retryable, and the keyboard map for `ChatInput`.
- `quickstart.md`: dev-server startup, browser steps to verify each user story, three starter-prompt walk-throughs (one per MCP tool), induced-error walk-throughs, accessibility quick check.
- Run `.specify/scripts/bash/update-agent-context.sh claude` to refresh the agent context file with `streamdown` as a new technology.

**Output**: `data-model.md`, `contracts/chat-ui.md`, `quickstart.md`, refreshed `CLAUDE.md` Active Technologies entry.

### Phase 2: Planning handoff

`/speckit.tasks` will translate this plan into a user-story-grouped task list. The structure here intentionally splits foundational tasks (store, stream reducer, history serializer, error-parsing utility, markdown wrapper, sidebar entry) from the three user-story groups (US1: thread/message/markdown/empty state; US2: tool indicators; US3: error blocks, Stop, retry, char counter) so tasks within a single story can ship independently.

## Story Verification

- **US1 — Streaming + multi-turn + markdown**:
  - Automated component test (`chat-page.streaming.test.tsx`) drives a mocked `Response` whose body is a `ReadableStream` of v6 UI-message parts (`start-step` → `text-delta` × N → `finish-step`) into the store action and asserts the assistant bubble's text grows incrementally; a follow-up `send()` call asserts the request body includes the prior turns.
  - Markdown component test (`markdown-content.test.tsx`) asserts gfm features render and that script tags / `javascript:` URLs are stripped.
  - Manual: dev server, send "do I have any products with 'monitor' in the name?", then "what's the price trend on the first one?".
- **US2 — Tool-call indicators**:
  - Automated test (`chat-page.tools.test.tsx`) feeds `tool-call` then `tool-result` parts and asserts indicator transitions running → completed; another feeds a tool error envelope and asserts running → failed; a third triggers Stop mid-tool and asserts running → stopped.
  - Manual: send "show me my monitored products", verify a `search_products` indicator appears and completes during the answer.
- **US3 — Errors / Stop / overlap prevention**:
  - Per-error-code automated tests in `chat-page.errors.test.tsx` (mock `fetch` to return JSON 4xx/5xx for pre-stream codes, mock the stream to emit `error` parts for in-stream codes); each asserts the right block + correct retry-affordance presence.
  - Stop test: start a never-finishing mock stream, click Stop, assert the partial assistant turn is preserved and marked `stopped`, the input is interactive again, and the running tool indicator (if any) is now `stopped`.
  - Overlap-prevention test: while one turn is streaming, attempt to type and press Enter; assert no second request is fired.
  - Manual: stop the MCP server (`pnpm worker:down` does not affect the MCP subprocess; instead temporarily rename `apps/mcp-server/dist/index.js` or set `MCP_SERVER_COMMAND` to a bogus path) and verify `mcp_unreachable` renders a recognizable error block.

## Technical Constraints

- The chat page MUST be rendered as a `"use client"` component; the server `page.tsx` is a thin shell that imports the client component, mirroring the convention in `dashboard/send-report/page.tsx`.
- The store MUST be a single module-level Zustand store (no `localStorage` middleware, no `BroadcastChannel`) — this is the operational expression of FR-010's "in-memory only, per-tab".
- The stream reducer MUST exhaustively switch over the v6 UI-message-part discriminated union; an unknown part type MUST log a single `console.warn` and be ignored, never throw — so a forward-compatible stream change does not crash the page.
- `serializeHistoryForApi` MUST drop assistant messages whose state is `stopped` or `errored` AND any tool messages that belonged to those dropped assistant turns; preservation order MUST otherwise match thread order. This is FR-004a expressed as a pure function with a unit test.
- The Stop button MUST always be enabled while `status === "streaming"`, including during tool execution (FR-008 + FR-006 — the `stopped` indicator state). The store action that handles Stop MUST mark every still-`running` tool indicator as `stopped` in the same set call that flips the assistant turn to `stopped`.
- No regex anywhere. Parsing the in-stream error JSON uses `JSON.parse` + Zod validation. URL-shape validation in the empty-state's "Add this product" prompt path uses the platform `URL` constructor inside a `try/catch`, not a regex.
- All client-side error logging MUST go through a small `chatLogger` helper colocated in `chat-store.ts` so we have one place to scrub if NFR-005 ever needs more defense in depth.
- The page MUST set up an `aria-live="polite"` region around the streaming assistant bubble (FR-016) and refocus the textarea when a turn ends or errors.
- `streamdown` MUST be configured with an explicit allowed-elements list — no `<iframe>`, `<script>`, `<style>`, no inline `on*=` handlers, no `javascript:` / `data:` schemes for links — even though those defaults are already off; the explicit config makes the safety contract reviewable.
- The Markdown renderer MUST render assistant text but MUST NOT be applied to user messages (user input is plain text and rendering markdown for it would make `**bold**` typos parse unexpectedly).

## Complexity Tracking

> No constitutional violations. The chosen "store-owned stream reader" approach means we write a small (~80-line) reducer for the v6 UI-message parts instead of using `useChat`. This is justified explicitly above (Phase 0 decision #1) because it is the simplest path that gives a single source of truth, and avoids fighting FR-010. No Complexity Tracking entries.
