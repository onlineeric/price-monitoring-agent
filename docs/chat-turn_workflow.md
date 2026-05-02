# Chat Turn Workflow — Reference

How the AI chat feature works end to end. Use this as the entry point when
debugging a chat issue, designing a Phase 3.6+ extension, or onboarding to
the codebase.

Spec sources:
- `docs/AI-agent-mcp-server-idea.md` — original idea + roadmap (Phases 1–6)
- `specs/004-chat-streaming-api/` — `POST /api/chat` streaming endpoint (Phase 3.3)
- `specs/005-chat-page-ui/` — `/dashboard/chat` browser UI (Phase 3.5)

---

## TL;DR

A browser chat page POSTs to `/api/chat`. The Next.js route asks an AI
provider (OpenAI / Anthropic / Google) to answer; when the provider wants
data, it invokes one of the MCP server's tools, which queries Postgres via
Drizzle. The response streams back to the browser as a sequence of UI-message
chunks (text deltas + tool events) which a Zustand store reduces into
rendered chat bubbles.

No new database tables. No new env vars. The chat feature is a pure consumer
of the existing extraction-pipeline data (products + priceRecords).

---

## System map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                BROWSER                                  │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  Next.js client (apps/web)                                       │  │
│   │   • Dashboard pages (Products, Send Report, Settings, …)         │  │
│   │   • /dashboard/chat   ← Phase 3.5                                │  │
│   │     uses Zustand store (in-memory, per tab) + streamdown render  │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────────────┘
                         │  HTTP / SSE
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Next.js server (apps/web)            ← runs the API routes             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ /api/products/*        list / create / patch                     │   │
│  │ /api/products/[id]/check-price    enqueue BullMQ job             │   │
│  │ /api/digest/trigger    enqueue digest                            │   │
│  │ /api/chat              ◄── Phase 3.3, what 3.5 calls             │   │
│  │   • Validates UIMessage[] (Zod)                                  │   │
│  │   • Resolves provider from AI_PROVIDER env                       │   │
│  │   • Spawns / re-uses MCP client (stdio child process)            │   │
│  │   • streamText() ↔ AI provider, multiplexed over MCP tools       │   │
│  │   • Streams UI-message protocol back to the browser              │   │
│  └────────────────┬────────────────┬───────────────────┬────────────┘   │
└───────────────────┼────────────────┼───────────────────┼────────────────┘
                    │ SQL            │ enqueue          │ stdio
                    │ (Drizzle)      │ (BullMQ)         │ (subprocess)
                    ▼                ▼                  ▼
        ┌───────────────┐  ┌──────────────┐    ┌────────────────────────┐
        │  PostgreSQL   │  │  Redis       │    │  apps/mcp-server       │
        │  • products   │  │  • BullMQ    │    │   exposes tools:       │
        │  • priceRecs  │  │    queue     │    │   • search_products    │
        │  • settings   │  │  • rate-     │    │   • get_product_history│
        │  • runLogs    │  │    limit     │    │   • get_price_summary  │
        └───────▲───────┘  │    counters  │    │   • add_product        │
                │          └──────▲───────┘    └─────────┬──────────────┘
                │                 │                      │ uses Drizzle
                │                 │                      │ to read/write DB
                │                 │                      ▼
                │                 │              (same Postgres above)
                │                 │
                │ reads/writes    │ pulls jobs
                │                 │
        ┌───────┴─────────────────┴───────────────────────────────────┐
        │  apps/worker (BullMQ consumer)                              │
        │  • check-price job → Tier 1 HTML scrape, Tier 2 Playwright  │
        │    + AI fallback → save priceRecord                         │
        │  • send-digest job → spawn check-price for active products  │
        │    → calculate trends → render React Email → Resend         │
        │  • scheduled digest (one worker has ENABLE_SCHEDULER=true)  │
        └─────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
                                  ┌────────────────────┐
                                  │ External services  │
                                  │ • Resend (email)   │
                                  │ • Playwright +     │
                                  │   target sites     │
                                  │ • AI providers     │
                                  │   (OpenAI/         │
                                  │    Anthropic/      │
                                  │    Google)         │
                                  └────────────────────┘
```

There are two independent flows in the system:

1. **Price-monitoring pipeline** — UI → API → BullMQ → worker → scrape → DB → email digest. Asynchronous, batch-flavored.
2. **Chat pipeline** — UI → `/api/chat` → AI provider ↔ MCP server → DB. Synchronous + streaming.

The MCP server is the **bridge** that lets the AI safely read/write the DB without raw SQL access (the constitution forbids text-to-SQL). The AI never sees Drizzle, never sees connection strings — only typed tool calls.

---

## Anatomy of one chat turn

The full path from a user keystroke to a rendered streamed answer.

```
USER types "show me my products" and hits Enter
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ ChatInput.tsx  →  useChatStore.send(text)                    │
│   1. Generate conversationId (first turn only, UUID)         │
│   2. Append UserMessage + empty AssistantMessage to store    │
│   3. Build UIMessage[] via serializeHistoryForApi (FR-004a)  │
│   4. fetch("/api/chat", {body, signal: AbortController})     │
└────────────────────────────────┬─────────────────────────────┘
                                 │ POST /api/chat (UIMessage[])
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js route  apps/web/src/app/api/chat/route.ts           │
│   1. Zod validates UIMessage[] (size, roles, system block)   │
│   2. resolveChatProvider() reads AI_PROVIDER env             │
│   3. buildMcpTools() ← spawns MCP child process (stdio),     │
│      lists tools, wraps each as an AI SDK Tool with Zod      │
│   4. convertToModelMessages(uiMessages, {tools})             │
│      ↳ produces ModelMessage[] with proper tool-call /       │
│        tool-result content parts (the SDK does this for us)  │
│   5. streamText({ system, messages, tools, abortSignal })    │
└──────────────┬─────────────────────────┬─────────────────────┘
               │                         │
               │ HTTPS                   │ stdio JSON-RPC
               ▼                         ▼
       ┌──────────────┐        ┌──────────────────────┐
       │ AI provider  │        │ apps/mcp-server      │
       │ (OpenAI/     │ ◄──────│  (child process)     │
       │  Anthropic/  │  tool  │   tool execution     │
       │  Google)     │  call  │   ↓                  │
       └──────┬───────┘        │   Drizzle query      │
              │                │   ↓                  │
              │                │   PostgreSQL         │
              │                └──────────┬───────────┘
              │                           │ result
              │                           ▼
              │                  back through MCP →
              │                  back to streamText loop
              │
              │ stream of v6 UI-message chunks:
              │   start → start-step → tool-input-available
              │   → tool-output-available → text-delta × N
              │   → finish-step → finish
              ▼
┌──────────────────────────────────────────────────────────────┐
│ Route's UI-message stream (toUIMessageStream)                │
│   • adds in-stream error events for step_budget_exceeded /   │
│     turn_timeout / empty_response                            │
│   • forwards everything as createUIMessageStreamResponse     │
└────────────────────────────────┬─────────────────────────────┘
                                 │ SSE (text/event-stream)
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ BROWSER  consumeChatStream() — chat-stream.ts                │
│   parseJsonEventStream(uiMessageChunkSchema) loop:           │
│    • text-delta            → append to assistant.text        │
│    • tool-input-available  → push ToolCallEvent (running)    │
│    • tool-output-available → flip to completed (or failed)   │
│    • error                 → ChatError, mark errored         │
│    • finish                → state: complete, status: idle   │
└────────────────────────────────┬─────────────────────────────┘
                                 │ Zustand updates
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│  React re-renders                                            │
│   • ChatMessage shows growing markdown via streamdown        │
│   • ToolCallIndicator transitions running → completed        │
│   • ChatInput refocuses when status returns to idle          │
└──────────────────────────────────────────────────────────────┘
```

---

## Wire format (request body)

The request uses the AI SDK v6 `UIMessage[]` shape. The server passes it
through `convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true })`
to produce provider-correct `tool-call` / `tool-result` content parts.

```jsonc
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {
      "id": "u-1",
      "role": "user",
      "parts": [{ "type": "text", "text": "show my products" }]
    },
    {
      "id": "a-1",
      "role": "assistant",
      "parts": [
        { "type": "text", "text": "Here are your products:" },
        {
          "type": "dynamic-tool",
          "toolName": "search_products",
          "toolCallId": "call_abc",
          "state": "output-available",
          "input":  { "query": "" },
          "output": { "products": [/* … */] }
        }
      ]
    },
    {
      "id": "u-2",
      "role": "user",
      "parts": [{ "type": "text", "text": "trend on the first one?" }]
    }
  ],
  "conversationId": "f1c8a4d2-…-uuidv4"
}
```

Why this shape: providers like OpenAI require any `tool` role message to
link to a preceding assistant `tool_calls` array. Building those messages
by hand is fiddly; the SDK does it correctly via `convertToModelMessages`.
We send the canonical UIMessage shape so the SDK can do its job.

> **History rule (FR-004a)**: stopped/errored partial assistant turns are
> dropped from the request, along with their tool events. This prevents
> the model from seeing half-finished prior reasoning.

---

## Streaming format (response body)

Server emits the AI SDK v6 UI-message-stream protocol. The browser
consumes it via `parseJsonEventStream(uiMessageChunkSchema)`. Chunks the
client cares about:

| Chunk | Effect on store |
|---|---|
| `start` / `start-step` / `finish-step` | Markers — no-op |
| `text-delta` | Append `delta` to active assistant message's `text` |
| `tool-input-available` | Push a `ToolCallEvent` with status `running` |
| `tool-output-available` | Find by `toolCallId`, flip `running → completed` (or `failed` if the result is an `{error: …}` envelope) |
| `error` | `JSON.parse(errorText)` → `ChatError`; assistant turn → `errored`, status → `errored` |
| `finish` | Assistant turn → `complete`, status → `idle` |

Unknown chunk types log one `console.warn` and are ignored — the reducer
is forward-compatible with future SDK versions.

---

## Where each spec phase lives

| Phase | Deliverable | Code location |
|---|---|---|
| 1 — MCP foundation | `ping` tool, MCP server skeleton | `apps/mcp-server/` |
| 2 — Real MCP tools | `search_products`, `get_product_history`, `get_price_summary`, `add_product` | `apps/mcp-server/src/tools/`, talks to DB via `packages/db` |
| 3.2 — MCP client (singleton) | Spawns + multiplexes the MCP child process | `apps/web/src/lib/mcp/` |
| 3.3 — `/api/chat` route | Streaming endpoint, provider resolver, tool bridging, error taxonomy, structured logger | `apps/web/src/app/api/chat/route.ts`, `apps/web/src/lib/ai/` |
| 3.4 — Domain-restriction prompt | Server-injected system prompt | `apps/web/src/lib/ai/chat-config.ts` (`CHAT_SYSTEM_PROMPT`) |
| **3.5 — Chat UI** | `/dashboard/chat` page + Zustand store + sanitized markdown | `apps/web/src/app/(main)/dashboard/chat/`, `apps/web/src/stores/chat/`, `apps/web/src/lib/chat/` |
| 3.6 (planned) | Database-backed history persistence | Future |
| 3.7 (planned) | Rich tool-call trace UI (args/results expansion) | Future |
| 4 (planned) | RAG semantic search via pgvector | Future |
| 5 (planned) | Smart Deal Analyzer in email digest | Future |

---

## Key files to know

### Server side (`apps/web/src/`)
- `app/api/chat/route.ts` — the route handler; orchestrates everything per turn
- `lib/ai/chat-validation.ts` — Zod schema for UIMessage[]; system-rejection rule
- `lib/ai/chat-config.ts` — `CHAT_SYSTEM_PROMPT`, step budget, turn timeout
- `lib/ai/chat-tools.ts` — MCP tool → AI SDK `Tool` bridging
- `lib/ai/chat-errors.ts` — error envelope shape, `scrubMessage` for NFR-005
- `lib/ai/chat-logger.ts` — per-turn structured logs with `conversationId` echo
- `lib/ai/provider.ts` — `AI_PROVIDER` env resolution
- `lib/mcp/client.ts` — MCP client singleton (one stdio subprocess shared across turns)

### Client side (`apps/web/src/`)
- `app/(main)/dashboard/chat/page.tsx` — server component, renders the client shell
- `app/(main)/dashboard/chat/_components/chat-page-client.tsx` — top-level layout, header, "New chat" button
- `app/(main)/dashboard/chat/_components/chat-thread.tsx` — scrollable thread + auto-scroll-with-pause
- `app/(main)/dashboard/chat/_components/chat-message.tsx` — one bubble; branches on user/assistant + state
- `app/(main)/dashboard/chat/_components/tool-call-indicator.tsx` — running/completed/failed/stopped pill
- `app/(main)/dashboard/chat/_components/chat-input.tsx` — textarea, Send/Stop, char counter, keyboard map
- `app/(main)/dashboard/chat/_components/chat-empty-state.tsx` — three FR-013 starter chips
- `app/(main)/dashboard/chat/_components/chat-error-block.tsx` — Alert + Retry per error code
- `app/(main)/dashboard/chat/_components/markdown-content.tsx` — `streamdown` wrapper with sanitization
- `stores/chat/chat-store.ts` — Zustand singleton; `send`/`stop`/`retry`/`reset` actions
- `stores/chat/chat-stream.ts` — UIMessage-chunk reducer; runs inside `send()`
- `stores/chat/chat-history.ts` — FR-004a serializer (DisplayedMessage[] → UIMessage[])
- `stores/chat/types.ts` — every entity type for the chat store
- `lib/chat/auto-scroll.ts` — `useAutoScrollToBottom` hook
- `lib/chat/chat-error-parsing.ts` — Zod error envelope parser, `isRetryable`

---

## Common scenarios

### Happy path: text-only answer
1. User sends a message that doesn't need data.
2. Route hits the provider; provider returns `text-delta` chunks then `finish`.
3. Reducer appends deltas to assistant text; on `finish`, status → idle.

### Tool call: data-grounded answer
1. User sends "show my products".
2. Provider requests a `search_products` tool call.
3. Route's tool wrapper invokes MCP via stdio; MCP runs the Drizzle query against Postgres; returns rows.
4. Provider receives the tool result and continues the turn with `text-delta` chunks.
5. Reducer pushes a `running` indicator on `tool-input-available`, flips to `completed` on `tool-output-available`, then resumes appending text deltas.

### Tool call fails
1. Route's tool wrapper catches the error and returns a `{error: {code, message}}` envelope to the provider (no endpoint-side retry).
2. Provider sees the envelope as the tool result and decides what to do — usually it explains the failure to the user and continues.
3. Client reducer flips the indicator to `failed` and keeps streaming.

### User clicks Stop mid-stream
1. `useChatStore.stop()` calls `abortController.abort()` and synchronously updates state: assistant turn → `stopped`; every still-`running` tool indicator → `stopped`.
2. The `fetch` promise rejects with `AbortError`; the reducer's loop swallows it.
3. Server-side: `request.signal` fires; `streamText` aborts the model + any in-flight tool call; logger records `turn_aborted`.

### Provider rejects mid-stream (or never sends data)
1. SDK surfaces `provider_error` as an in-stream `error` chunk with a serialized `{error: {code, message}}`.
2. Reducer parses, marks assistant `errored`, status → `errored`.
3. UI renders `<ChatErrorBlock>` with a Retry button (provider_error is retryable).

### User clicks Retry
1. `retry()` removes the trailing errored assistant from `messages` and clears `error`.
2. Calls `send(prevUserText)` again with the same `conversationId`.
3. New attempt streams into the same slot.

### Pre-stream error (validation, missing provider config, MCP unreachable)
1. Route returns HTTP 4xx/5xx with a JSON `{error: {code, message}}` body.
2. Client parses the body and marks the (already-appended) empty assistant bubble as `errored` with `surface: "pre-stream"`.
3. UI renders the error block in place of the bubble. Retry is offered for `mcp_unreachable` only — `validation_error` and `provider_config_missing` won't succeed on retry.

---

## Error taxonomy (recap)

Seven error codes; the client maps each to a recognizable UI block.

| Code | Surface | Retry button | When |
|---|---|---|---|
| `validation_error` | pre-stream JSON 400 | No | Request body fails Zod (oversize, system role, malformed) |
| `provider_config_missing` | pre-stream JSON 500 | No | `AI_PROVIDER` model env var unset |
| `mcp_unreachable` | pre-stream JSON 502 | Yes | MCP child process can't be reached |
| `provider_error` | in-stream `error` chunk | Yes | AI provider failed mid-turn |
| `step_budget_exceeded` | in-stream `error` chunk | Yes | Model hit the 5-step tool-call budget |
| `turn_timeout` | in-stream `error` chunk | Yes | 60s wall-clock per-turn timer fired |
| `empty_response` | in-stream `error` chunk | Yes | Model produced no text and no tool call |

All error messages are scrubbed of API keys, stack traces, and absolute
paths before leaving the server (`scrubMessage` in `chat-errors.ts`,
NFR-005).

---

## Domain restriction

The system prompt (server-injected, can't be overridden by clients —
FR-008a) restricts the assistant to the Price Monitor domain (products,
prices, trends, deals, adding products). Anything off-topic gets a
templated polite decline, redirecting to a price-monitoring task.

The full prompt lives in `apps/web/src/lib/ai/chat-config.ts` →
`CHAT_SYSTEM_PROMPT`.

---

## What 3.5 deliberately does NOT do

- **Persist conversation history** — the Zustand store is in-memory per tab; full page reload resets it. Database persistence is Phase 3.6.
- **Sync across tabs** — two tabs hold independent conversations.
- **Authenticate** — single-user / unauthenticated, same posture as the rest of the app. Auth + rate limiting are Phase 6.6.
- **Render rich tool-call traces** — the indicator shows tool name + status only. Argument/result expansion is Phase 3.7.
- **Run RAG / semantic search** — Phase 4.

---

## Quick troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| "AI provider hit an error · No output generated" | Bad request shape sent to the provider | Check `route.ts` is calling `convertToModelMessages` (was a real bug — fixed) |
| "Can't reach the data service" (mcp_unreachable) | MCP server not built or stdio command wrong | `pnpm mcp:build`; check the spawn config in `apps/web/src/lib/mcp/client.ts` |
| "AI provider not configured" | Missing model env var | Set `OPENAI_MODEL` / `ANTHROPIC_MODEL` / `GOOGLE_MODEL` in `apps/web/.env` |
| Page renders but no streaming | Browser blocked SSE; or response.body null | DevTools → Network → look for `text/event-stream` Content-Type and chunked body |
| Tool indicator never appears | The model didn't call a tool (text-only answer) — not a bug | Re-prompt with something that needs data |
| Markdown rendered as raw asterisks | `MarkdownContent` not used; or text passed directly to a `<p>` | Should always go through `MarkdownContent` for assistant turns; never for user turns |

---

## Cross-references

- Spec & rationale for each constraint: `specs/004-chat-streaming-api/spec.md`, `specs/005-chat-page-ui/spec.md`
- Wire-format contract details: `specs/004-chat-streaming-api/contracts/chat-api.md`, `specs/005-chat-page-ui/contracts/chat-ui.md`
- Manual verification script: `specs/005-chat-page-ui/quickstart.md`
- Original roadmap: `docs/AI-agent-mcp-server-idea.md`
