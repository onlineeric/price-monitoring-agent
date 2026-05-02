# Feature Specification: Chat Streaming API with MCP Tool Calling

**Feature Branch**: `004-chat-streaming-api`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "read @docs/AI-agent-mcp-server-idea.md , refer to our current repo, do Phase 3.3"

## Clarifications

### Session 2026-04-20

- Q: What maximum tool-calling step budget should the endpoint enforce per turn? → A: 5 steps
- Q: What maximum conversation history size should the endpoint accept per request? → A: 100 messages
- Q: What authentication posture applies to `/api/chat` in this phase? → A: Unauthenticated; deferred to Phase 6.6
- Q: Which streaming protocol does the endpoint emit? → A: Data stream (AI SDK data-stream protocol)
- Q: How should the endpoint handle a tool failure inside the tool-call loop? → A: Always surface structured error to the model; no endpoint-side retry
- Q: What hard per-turn timeout should the endpoint enforce? → A: 60 seconds
- Q: Who supplies the system/instruction message for a chat turn? → A: Server-injected only; client-supplied system messages are rejected
- Q: What maximum character length should the endpoint enforce per individual message? → A: 10,000 characters
- Q: How should the endpoint handle oversized tool results returned by MCP tools? → A: Pass through untouched; MCP tools are responsible for self-limiting
- Q: How much should the endpoint trust client-supplied `tool` and `assistant` messages in the history array? → A: Trust fully; document the portfolio-context trade-off (context-poisoning mitigation deferred to Phase 6.6 alongside auth)
- Q: Is the conversation id required, optional, or omitted from the request contract? → A: Optional free-form string; server generates a per-turn id for logging regardless
- Q: What first-chunk latency target applies to the first request after a cold boot (MCP subprocess not yet spawned)? → A: 15 seconds
- Q: How should the endpoint handle the model returning an empty response (no text and no tool call)? → A: Terminate the turn with a distinguishable "empty response" error event
- Q: How should the endpoint behave if the MCP server publishes zero tools? → A: Degrade gracefully to text-only chat (no tool calling); log a warning

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask a question and receive a streamed, data-grounded answer (Priority: P1)

A signed-in user opens the chatbot experience and asks a question about their
monitored products (for example, "How has my Sony monitor price moved in the last
30 days?"). The backend answers by consulting the product database through the
MCP server's tools and streams the response back token-by-token so the user sees
the answer appearing as it is generated rather than waiting for the full response.

**Why this priority**: This is the core value proposition of the AI agent. Without
a working streaming endpoint that can invoke MCP tools, neither the chat UI
(Phase 3.5) nor any later feature (RAG, tool-trace display, multi-turn memory)
can function. It is the minimum slice that proves end-to-end plumbing —
client → API → MCP server → database → model → client — actually works.

**Independent Test**: Can be fully tested with an HTTP client (curl, HTTPie,
Postman) that posts a chat message to the endpoint and consumes the streamed
response. Success looks like: (a) the response is delivered as an incremental
stream, not a single final blob, and (b) when the question requires database
information, the model's answer contains data the model could not have invented,
proving an MCP tool was actually invoked against the database.

**Acceptance Scenarios**:

1. **Given** a user sends a question that the model can answer without external
   data ("what topics can you help with?"), **When** the request reaches the
   chat endpoint, **Then** the endpoint returns a streamed text response in a
   format the Vercel AI SDK chat UI can consume.
2. **Given** a user asks "do I have any products with 'monitor' in the name?",
   **When** the model decides to call the `search_products` MCP tool, **Then**
   the endpoint executes the tool via the MCP client, feeds the result back to
   the model, and streams the model's final natural-language answer containing
   the real product names from the database.
3. **Given** a user asks a question that requires two tools in sequence ("find
   my Sony monitor and show me its price trend"), **When** the model requests a
   second tool call after receiving the first tool's result, **Then** the
   endpoint supports the additional step within a bounded maximum number of
   tool-calling iterations and returns a coherent final answer.

---

### User Story 2 - Provider-agnostic chat powered by the repository's active AI provider (Priority: P1)

The chat endpoint runs under whichever AI provider the repository is currently
configured to use (OpenAI, Anthropic, or Google). An operator can switch the
active provider by changing a single environment variable and restarting the web
app — no code changes, no new deployment of a different build, and no divergence
from the pattern already used by the background worker.

**Why this priority**: The project's existing extraction worker already supports
all three providers behind an `AI_PROVIDER` switch. The chat feature must match
that pattern so the repository presents one coherent story about provider
selection. If chat hard-codes a single provider, every subsequent AI feature
(Deal Analyzer, embeddings) will inherit an inconsistent convention, and the
portfolio value of "see this app run on any of three major LLM providers" is
lost. Aligning from the start is cheaper than retrofitting later.

**Independent Test**: Start the web app three times with `AI_PROVIDER` set to
`openai`, `anthropic`, and `google` respectively (assuming the corresponding API
key and model env vars are present), send the same chat request each time, and
observe that all three return sensible streamed answers. A fourth run with a
missing API key for the selected provider should fail fast with a clear error
rather than silently falling back to a different provider.

**Acceptance Scenarios**:

1. **Given** `AI_PROVIDER=anthropic` and a valid `ANTHROPIC_API_KEY` /
   `ANTHROPIC_MODEL`, **When** a chat request is posted, **Then** the response
   is generated by Anthropic and streamed back successfully.
2. **Given** `AI_PROVIDER=google` and valid Google credentials/model, **When**
   a chat request is posted, **Then** the response is generated by Google.
3. **Given** `AI_PROVIDER` is unset or set to an unsupported value, **When**
   the web app starts or the first chat request is posted, **Then** the system
   defaults to OpenAI (matching the worker's behavior) and this default is
   observable in logs.
4. **Given** `AI_PROVIDER=openai` but `OPENAI_MODEL` is missing, **When** a
   chat request is posted, **Then** the endpoint returns a clear error response
   identifying the missing configuration rather than crashing the process.

---

### User Story 3 - Robust error handling that keeps the conversation usable (Priority: P2)

When something goes wrong — the MCP server process is not reachable, a tool
throws, the model provider rate-limits the request, the user's prompt is
malformed, or the tool-call loop exceeds its step budget — the chat endpoint
returns a clear, structured failure signal that the UI can surface to the user
without the whole app crashing or the client hanging forever. Recoverable errors
inside the tool-call loop (one tool fails but others could still help) do not
abort the entire conversation turn.

**Why this priority**: P1 covers the happy path; P2 covers the failure modes
that will show up the first time a real user uses the feature. Without this,
the first demo to a stakeholder that encounters a cold MCP server or an API key
hiccup will look broken rather than gracefully degraded. This must ship before
the UI in Phase 3.5 because the UI contract depends on knowing what error
shapes to render.

**Independent Test**: Deliberately induce each failure mode (stop the MCP
server, supply an invalid API key, send a malformed request body, construct a
prompt that forces the model to loop past the step limit) and verify for each
that: (a) the endpoint responds instead of hanging, (b) the response shape is
recognizable as an error rather than looking like a normal streamed answer, and
(c) a log entry is produced with enough context to diagnose the failure.

**Acceptance Scenarios**:

1. **Given** the MCP server process cannot be started or connected to, **When**
   a chat request is posted, **Then** the endpoint returns a structured error
   response identifying the failure as an MCP connectivity issue and logs the
   underlying cause.
2. **Given** the model calls a tool and the tool raises an exception, **When**
   the error propagates back through the MCP client, **Then** the endpoint
   surfaces the structured error (already produced by the Phase 2.6 wrapper)
   to the model **with no endpoint-side retry**, so the model decides whether
   to retry with different arguments, call a different tool, or explain the
   failure to the user — the turn does not terminate on a single tool error.
3. **Given** the request body is missing required fields or exceeds a maximum
   message/turn size, **When** the endpoint validates the input, **Then** it
   responds with a client-error status and a message naming the specific
   validation failure.
4. **Given** the tool-calling loop reaches its configured maximum step count
   without the model producing a final answer, **When** the limit is hit,
   **Then** the endpoint ends the stream with a clear "step budget exceeded"
   signal rather than looping indefinitely.
5. **Given** the AI provider returns a rate-limit or auth error mid-stream,
   **When** the error surfaces, **Then** the stream terminates cleanly with a
   structured error event so the UI can render a retry affordance.

---

### Edge Cases

- **Multi-turn prompts with large history**: The client may send a growing
  conversation history on each turn. The endpoint must accept an array of prior
  messages (user + assistant + tool) and include them in the model call so
  answers remain coherent across turns. The endpoint caps the accepted history
  at **100 messages per request** to bound memory and token cost; requests
  exceeding this limit are rejected as validation errors (see FR-008).
- **Abandoned streams**: If the client disconnects mid-stream (tab closed,
  network drop), the endpoint must stop generation and release resources
  (abort the model request, close MCP tool calls in flight) instead of
  continuing to run in the background.
- **Off-topic prompts**: Phase 3.4 will populate the server-injected system
  prompt to restrict the assistant to product/price topics. This spec does
  not author that prompt text, but the server-side injection point and the
  validator's rejection of client-supplied system messages (FR-008a) are
  already in place, so Phase 3.4 is a content-only change.
- **Tool returns an empty or ambiguous result**: When a tool returns zero rows
  (e.g., `search_products` with a query matching nothing), the model receives
  the empty result and should respond helpfully (e.g., "no products match
  that"), rather than the endpoint treating empty results as an error.
- **Concurrent chat requests**: Multiple users (or one user with multiple tabs)
  may hit the endpoint simultaneously. The MCP client is shared (a singleton
  holding one stdio subprocess), so concurrent tool calls must be multiplexed
  safely over that single connection.
- **Cold-start latency**: On the first request after a server boot, the MCP
  subprocess has not yet spawned. The endpoint must handle the extra startup
  latency transparently (streaming begins once ready) rather than timing out,
  with a relaxed **15-second first-chunk target** on that first request
  (SC-002). Subsequent requests fall under the warm 3s / 6s targets.
- **Empty model response**: When the model finishes a turn producing neither
  text nor a tool call, the endpoint MUST terminate the stream with a
  distinguishable **"empty response" error event** rather than emitting a
  clean `done` on a blank assistant message. This keeps the "nothing
  happened" case visible in logs and surfaceable in the UI.
- **Empty tool list from MCP server**: If the MCP server publishes zero tools
  at the moment a request arrives, the endpoint MUST still serve the turn as
  a **plain text-only chat** (no tool-calling options passed to the model)
  and log a warning. This preserves chat availability if the MCP server is
  misconfigured or in a degraded state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a chat endpoint at a stable path under the
  web app's API surface that accepts POST requests carrying a conversation
  (user + prior assistant/tool messages).
- **FR-002**: The endpoint MUST stream the assistant's response back to the
  caller incrementally using the **Vercel AI SDK data-stream protocol** (the
  protocol consumed by the AI SDK's `useChat` hook), so that text deltas,
  tool-call events (name + arguments + result), and structured error events
  all travel in-band on the same stream. The raw text-stream protocol is NOT
  sufficient because Phase 3.7 requires tool-call traces to be renderable by
  the UI.
- **FR-003**: The endpoint MUST present the MCP server's currently registered
  tools to the model so the model can invoke them. The tool list MUST be
  sourced live from the MCP client rather than hard-coded, so new tools added
  to the MCP server become available to chat without web-app code changes.
- **FR-004**: When the model requests a tool call, the endpoint MUST execute
  that call through the MCP client, return the structured result to the
  model **unmodified and untruncated**, and continue generation with the
  tool result in context. Bounding tool-result size is the responsibility of
  each individual MCP tool (e.g., via pagination or limit parameters in the
  tool's own Zod schema), not of this endpoint.
- **FR-005**: The endpoint MUST support multi-step tool-calling within a single
  conversation turn (the model can call a tool, receive the result, then call
  another tool or produce the final answer) up to a maximum of **5 steps** per
  turn. The step budget MUST be enforced even if the model requests further
  tool calls beyond the limit.
- **FR-006**: The endpoint MUST honor the `AI_PROVIDER` environment variable
  (`openai` | `anthropic` | `google`) and select the corresponding provider
  and model via the same resolution logic used by the extraction worker, so
  the repository has one consistent provider-selection pattern. When
  `AI_PROVIDER` is unset or unrecognized, the endpoint MUST default to OpenAI.
- **FR-007**: The endpoint MUST fail fast with a clear error when the selected
  provider is missing its required configuration (API key or model name),
  rather than silently degrading or hanging.
- **FR-008**: The endpoint MUST validate incoming request bodies (shape, field
  types, message array length capped at 100 messages, allowed roles limited
  to `user` / `assistant` / `tool`, and each individual message content
  capped at 10,000 characters) before invoking the model and return a client
  error for malformed, oversized, or system-role-containing input.
- **FR-008a**: The endpoint MUST inject the system/instruction message
  server-side on every turn; it MUST NOT accept a system message from the
  client. This preserves the domain-restriction guardrail that Phase 3.4 will
  populate so it cannot be bypassed by a malicious or misbehaving client.
- **FR-009**: When an individual tool execution fails, the endpoint MUST
  surface the Phase 2.6 structured error (`{ error: { code, message } }`)
  back to the model as the tool result — with **no endpoint-side retry** —
  so the model can decide whether to retry with different arguments, call a
  different tool, or explain the failure to the user. Only when the MCP
  connection itself is broken (the client cannot reach the MCP server at
  all) MUST the endpoint terminate the turn with a clearly distinguishable
  error event on the data stream.
- **FR-010**: When the tool-calling step budget is exhausted without a final
  answer, the endpoint MUST end the stream with a distinguishable "budget
  exceeded" signal rather than looping or silently truncating.
- **FR-011**: When the client disconnects mid-stream, the endpoint MUST abort
  in-flight model generation and tool calls and release associated resources.
- **FR-011a**: The endpoint MUST enforce a **60-second hard timeout per turn**.
  If the turn (model generation + all tool calls combined) has not produced a
  final answer within 60 seconds, the endpoint MUST abort in-flight model and
  tool work and terminate the stream with a distinguishable "turn timeout"
  error event, independent of the step-budget check in FR-010.
- **FR-012**: The endpoint MUST emit server-side log entries for: each chat
  turn received, each tool call invoked (name + duration + success/failure),
  each provider error, and each validation rejection — sufficient for later
  tracing and debugging without requiring the full Phase 6 observability
  stack. Every log line for a turn MUST carry a server-generated per-turn id;
  if the client supplied a `conversationId`, the server MUST include it
  alongside the per-turn id in the same log lines.
- **FR-013**: The endpoint MUST work with the existing singleton MCP client
  under concurrent requests without corrupting in-flight tool calls across
  requests.

### Non-Functional Requirements

- **NFR-001**: First streamed token MUST reach the client within a few seconds
  under normal conditions (provider reachable, MCP warm, no tool call
  required) so the UI does not look frozen.
- **NFR-002**: The maximum tool-calling step budget per turn is 5 steps,
  chosen to bound worst-case latency and token cost.
- **NFR-003**: The endpoint MUST not leak provider API keys, raw stack traces,
  or internal file paths in responses returned to the client.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/web` (new API route and supporting lib code;
  depends on the existing `apps/web/src/lib/mcp/` client introduced in Phase
  3.2). No changes to `apps/worker`, `packages/db`, or `apps/mcp-server/` are
  required for this feature. Later features (UI in 3.5, system prompt in 3.4)
  will consume the contract this spec defines.
- **Data and Contracts Impact**: Introduces a new HTTP contract — request and
  response schemas for the chat endpoint, including the streaming format and
  error envelope. No database schema changes. No BullMQ queue changes. No
  changes to extraction output. The MCP tool contract is unchanged; this
  feature only consumes the tools published by Phase 2.
- **Operational Impact**:
  - Reuses the existing `AI_PROVIDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`,
    `GOOGLE_MODEL`, and associated API key env vars already validated in the
    worker — the web app will need the same keys present at runtime.
  - May add one new env var to cap the tool-calling step budget if operators
    need to tune it per environment; otherwise a sensible default is baked in.
  - The endpoint uses the Node.js runtime (not Edge) because the MCP client
    spawns a child process and relies on stdio transport.
  - Deployment story is unchanged: the existing web container already has the
    AI SDK and MCP SDK deps; no new infrastructure or secrets management work
    required.
  - Graceful shutdown: on web-app termination, the MCP client singleton's
    `closeMcpClient` must be invoked so the stdio subprocess exits cleanly
    (already available from Phase 3.2).
- **Verification Notes**:
  - User Story 1 (happy-path streaming + tool call) requires an automated
    integration test that hits the route with a realistic payload and asserts
    on the streamed output shape and at least one MCP tool invocation.
  - User Story 2 (provider abstraction) is verified by unit tests on the
    provider-selection helper plus a manual check against at least two of the
    three providers before merge.
  - User Story 3 (error handling) requires automated tests for each failure
    mode (MCP unreachable, tool throws, malformed body, step-budget overflow)
    since these are the paths most likely to regress silently.
  - No new contract test suite is required beyond the web app's existing
    Vitest setup.

### Key Entities

- **Chat Turn Request**: An inbound request representing one user message in
  the context of a conversation. Conceptually holds: the ordered list of prior
  messages (roles: **user, assistant, tool** only — system messages from the
  client are rejected by the validator), the new user message, and optional
  metadata the UI may pass through. A `conversationId` field is **optional
  and free-form string**; when present the server echoes it into logs for
  cross-turn debugging, and when absent the server still generates a unique
  per-turn id for every request so every log line is addressable. The
  system/instruction message is injected server-side so the domain-restriction
  prompt introduced in Phase 3.4 cannot be bypassed or overridden by the
  client. Persistence of this conversation is explicitly out of scope for
  this feature — the client holds the history.
- **Chat Turn Response Stream**: An outbound stream representing the
  assistant's evolving response. Conceptually carries: incremental text tokens,
  tool-call events (tool name + arguments + result), and a terminal event that
  is either "done" or a structured error.
- **Tool Invocation Event**: One execution of an MCP tool during a turn.
  Attributes: tool name, arguments the model supplied, result or error
  returned, duration. Surfaced in logs now; surfaced in the UI in Phase 3.7.
- **Provider Selection**: The resolved AI provider and model for a given
  request, derived from `AI_PROVIDER` + model env vars. Not a persisted
  entity — computed per request (or per process) and emitted in logs for
  support diagnosis.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user sending a chat message that requires database lookup
  receives an answer whose content is grounded in real product/price-history
  data from the database in at least 95% of observed runs during acceptance
  testing — proving tool-calling works end to end.
- **SC-002**: The first streamed chunk reaches the client within **3 seconds**
  for a warm endpoint on a request that does not trigger a tool call, and
  within **6 seconds** for a request that triggers exactly one tool call.
  These warm targets hold for all three supported providers. On a **cold
  boot** (first request after process start, MCP stdio subprocess not yet
  spawned), the first streamed chunk MUST arrive within **15 seconds**;
  subsequent requests fall back to the warm targets.
- **SC-003**: The endpoint correctly serves the chat feature under each of the
  three supported `AI_PROVIDER` values with no code changes between runs —
  verified end to end before the feature is considered ready.
- **SC-004**: Every one of the induced failure modes listed in User Story 3
  produces a response (not a hang or crash) that the client can distinguish
  from a successful answer, and every one produces a server log entry
  sufficient to identify the failing component — verified by an automated
  test per failure mode.
- **SC-005**: Zero chat turns are observed to loop past the configured step
  budget during acceptance testing; every turn either produces a final answer
  within budget or terminates with the explicit budget-exceeded signal.
- **SC-006**: The frontend chat UI work in Phase 3.5 is unblocked — the UI
  team (in practice, the next task in this roadmap) can build against the
  documented request/response contract without needing any additional change
  to this endpoint.

## Assumptions

- The endpoint is deployed **unauthenticated** in this phase, consistent with
  the other API routes currently under `apps/web/src/app/api/` and with the
  single-tenant portfolio context. Authentication and rate limiting are
  explicitly deferred to Phase 6.6. Acceptance tests for this phase assume no
  auth headers are required.
- The endpoint **trusts client-supplied conversation history fully**,
  including `tool` and `assistant` messages the client sends as prior turns.
  A malicious client could fabricate tool-result messages to poison the
  model's context (for example, pre-seeding a fake price). This is accepted
  as a portfolio-context trade-off given the unauthenticated single-user
  posture; mitigating it (message signing, server-side history, or
  sanitization of replayed tool messages) is bundled with the Phase 6.6 auth
  hardening work rather than this feature.
- Conversation persistence is not part of this feature. The client is the
  source of truth for conversation history during this phase; database-backed
  persistence is explicitly deferred to Phase 3.6.
- The MCP client built in Phase 3.2 exposes the necessary primitives (list
  tools, call tool by name with arguments, close) and is stable enough to
  build against. This feature does not modify the MCP client itself.
- Phase 2.6's structured tool-error shape (`{ error: { code, message } }`) is
  the canonical error signal coming out of the MCP layer; this feature relays
  those rather than inventing a parallel scheme.
- MCP tools are trusted to self-limit their result size (via their own input
  schema — pagination, row caps, date ranges, etc.). The chat endpoint does
  not apply any size cap to tool results before handing them to the model.
  If a future tool is observed to return unbounded payloads in practice, the
  fix belongs in that tool's schema, not in this endpoint.
- The Phase 3.5 frontend will use the Vercel AI SDK's `useChat` hook, which
  consumes the data-stream protocol (see FR-002). No bespoke wire format is
  introduced by this feature.
- Logs written here are plain `console.*` / existing logger calls. The full
  tracing system (Langfuse or equivalent) is Phase 6.3 and is not a dependency
  of this feature.
