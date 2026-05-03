# Research: MCP Server HTTP Transport Mode

**Feature**: 006-mcp-http-transport
**Date**: 2026-05-03

This document records the design decisions resolved before implementation
begins. Every clarification from `spec.md` (Session 2026-05-03) is reflected
here with the rationale and the alternatives that were rejected, so future
maintainers can understand *why* the code looks the way it does.

## Decision 1 — Stateless vs stateful Streamable HTTP

**Decision**: Stateless mode (`sessionIdGenerator: undefined`).

**Rationale**: Every MCP tool in this project is itself stateless — each one
is an independent Drizzle query (`search_products`, `get_product_history`,
`get_price_summary`) or a single BullMQ enqueue (`add_product`). There is no
streaming subscription, no resumable operation, and no per-client cursor.
Stateless mode means each `POST /mcp` is a self-contained request/response,
no session ID is exchanged, and no in-memory session map needs to live in
the process. This also makes the service horizontally scalable behind any
future load balancer with zero sticky-session work.

**Alternatives considered**:
- *Stateful mode with a generated session ID*: would let the SDK keep an
  in-memory session map keyed by `Mcp-Session-Id` header. Rejected because
  no current tool benefits from session state, and adopting it now would
  block horizontal scaling later (every chat turn could land on a different
  pod). Adding statefulness later is cheaper than removing it.
- *Hybrid (stateful when header present, otherwise stateless)*: rejected as
  unnecessary complexity for zero current benefit.

**Source**: spec.md FR-005 + Clarifications Session 2026-05-03.

## Decision 2 — Node `node:http` vs an HTTP framework

**Decision**: Use Node's built-in `node:http` to route the two endpoints.

**Rationale**: The HTTP surface in this feature is two endpoints —
`POST /mcp` (delegate body to SDK) and `GET /health` (return small JSON).
Pulling in Express, Fastify, or Hono for a two-endpoint surface adds a
runtime dependency, a bundle-size cost, a learning surface for future
maintainers, and a security surface (transitive dependencies) without
solving any problem the standard library does not already solve. The MCP
SDK's `StreamableHTTPServerTransport.handleRequest(req, res)` accepts the
raw Node `IncomingMessage` / `ServerResponse` directly, so no adapter is
needed.

**Alternatives considered**:
- *Express*: idiomatic but pulls in 50+ transitive packages for two
  routes. Rejected.
- *Hono*: lightweight, but the SDK already uses `@hono/node-server`
  internally for its own Web Standard adapter — adding Hono at the app
  layer would create two ways to do the same thing. Rejected.
- *Fastify*: same dependency-cost objection. Rejected.

**Source**: spec.md FR-015 + Clarifications Session 2026-05-03 (decision
deemed sufficient by roadmap entry).

## Decision 3 — File layout: dispatcher + per-transport modules

**Decision**: Refactor `src/index.ts` into a thin dispatcher that reads
config, builds the `McpServer` instance, then hands off to
`src/transports/stdio.ts` or `src/transports/http.ts`. Tool registration
moves into `src/server.ts` so both transports share an identical tool set.

**Rationale**: NFR-004 calls for "a clear file layout — a transport-
dispatching entry point and one module per transport — so future
maintainers can reason about each path independently". The split also
makes the integration tests easier to write: each test file imports the
spawn helper, sets the relevant env, and exercises only one transport.

**Alternatives considered**:
- *Keep everything in `src/index.ts`*: would mean one file responsible for
  env parsing, tool registration, both transports, signal handling, the
  HTTP server, and access logging. Rejected as a maintainability hazard.
- *One transport-agnostic factory*: the two transports have different
  lifecycles (stdio: connect once, exit when stdin closes; HTTP: long-
  running, signal-driven shutdown). Forcing them into a shared abstraction
  would obscure rather than clarify. Rejected.

**Source**: spec.md NFR-004.

## Decision 4 — Listener bind address

**Decision**: Always bind `0.0.0.0` in HTTP mode.

**Rationale**: The production deploy (task 3.18) expects the web container
to reach the MCP container by service hostname over Coolify's internal
network — that requires `0.0.0.0`. Local development with the Docker
compose entry from task 3.12 maps `3001:3001` to the host, which also
requires the container to bind `0.0.0.0` internally. The access boundary
in production is the network topology (no public domain, no TLS
termination at this layer); in local dev it is the developer laptop. A
configurable bind would add an env var with no real use case.

**Alternatives considered**:
- *Default `127.0.0.1`, opt into `0.0.0.0` via `MCP_HTTP_HOST`*: rejected
  because the prod and Docker dev paths both require `0.0.0.0`, so the
  default would be wrong for the only environments that matter.
- *Auto-detect based on `NODE_ENV`*: rejected as magic; explicit single
  behavior is easier to reason about.

**Source**: spec.md FR-003 + Clarifications Session 2026-05-03.

## Decision 5 — Per-request HTTP timeout

**Decision**: 30 seconds, hard-coded constant in `src/transports/http.ts`.

**Rationale**: Each MCP tool today is either a single Drizzle query or a
BullMQ enqueue, both of which complete in well under a second. 30s is
generous enough to absorb a transient slow query without false-aborts,
while still leaving headroom inside the chat-side 60-second per-turn
timeout (spec 004 FR-011a) so the chat side can surface a clear MCP
timeout error to the user before its own deadline expires. Implementation:
set `req.setTimeout(30_000)` per incoming request and respond with the
structured `{ error: { code: "request_timeout", message: ... } }` envelope
(consistent with `_wrap.ts`).

**Alternatives considered**:
- *No per-request timeout*: rejected because a stuck Postgres or Redis
  would let the socket sit open until the chat side gives up, consuming
  the entire chat-turn budget without a clear MCP-layer signal.
- *60 seconds (matching chat budget)*: rejected because a hung tool would
  eat the chat side's entire budget; the tighter MCP-layer bound exists
  precisely to fail before the chat side does.
- *Configurable via env var*: rejected; one constant matches the project's
  preference for explicit, unambiguous behavior. If a future tool needs
  longer, that tool's spec can revisit.

**Source**: spec.md FR-011a + Clarifications Session 2026-05-03.

## Decision 6 — Per-request access logging

**Decision**: One stderr line per `POST /mcp` request, format
`[mcp-server] http POST /mcp method=<json-rpc-method> tool=<name|-> status=<code> ms=<ms>`.
`GET /health` requests are NOT logged. Request bodies and tool arguments
are NOT logged.

**Rationale**: HTTP mode runs as a separate container with no parent
process holding the stream — operators tailing the container logs need
some per-request observability. Logging just the JSON-RPC method name
and (for `tools/call`) the tool name gives enough context to correlate
with chat-side traces without leaking user search terms or PII.
Excluding `/health` keeps orchestrator probe spam out of the log stream.

**Alternatives considered**:
- *No per-request logs*: rejected; future operators tailing a Coolify log
  would have no visibility into request volume or per-tool latency.
- *Log failures only*: rejected; cannot see baseline traffic or distinguish
  "no requests" from "all requests succeed".
- *Verbose logs (request body + response status)*: rejected per NFR-003;
  request bodies may contain user search terms and PII.

**Source**: spec.md FR-013a + Clarifications Session 2026-05-03.

## Decision 7 — `GET /mcp` (SDK SSE upgrade) handling

**Decision**: Delegate `GET /mcp` to
`StreamableHTTPServerTransport.handleRequest()`. Do not pre-intercept in our
router.

**Rationale**: The SDK reserves `GET /mcp` for its own SSE upgrade /
server-initiated message channel. In stateless mode the SDK returns the
appropriate response (typically 405 or an immediately-closed empty
stream). If we pre-intercept with our own 405, a future SDK version that
re-enables `GET /mcp` for some legitimate reason would silently break
because our short-circuit would still be returning 405. Delegating keeps
the SDK authoritative.

**Alternatives considered**:
- *Pre-intercept `GET /mcp` with 405 in our router*: rejected as
  brittle against SDK updates.
- *Return 404 for `GET /mcp`*: rejected because the path *is* registered
  to the SDK, even if the method is not supported in stateless mode — 405
  is the protocol-correct semantic and the SDK already produces it.

**Source**: spec.md FR-004 + Clarifications Session 2026-05-03.

## Decision 8 — Graceful shutdown grace window

**Decision**: 10 seconds. On `SIGTERM` or `SIGINT`, stop accepting new
connections via `server.close()`, wait for in-flight handlers to settle
up to 10 s, then `process.exit(0)`. If the window elapses, log a warning
and exit anyway.

**Rationale**: Every MCP tool today completes in well under a second
(single DB query or single Redis enqueue). 10 s comfortably covers the
slowest realistic in-flight call plus a safety margin, and stays within
the typical orchestrator default of 30 s for `docker stop` so the deploy
does not need a custom `stop_grace_period`. If a future tool genuinely
needs longer, that tool's spec must revisit this number — better to have
one place to look than to make the window configurable up front.

**Alternatives considered**:
- *No graceful shutdown*: rejected; in-flight chat tool calls would be
  dropped on every deploy.
- *5 seconds*: rejected as too tight if a single Drizzle query happens to
  be slow during shutdown.
- *30 seconds*: rejected as longer than necessary and risks the
  orchestrator killing the process before our drain finishes.
- *Configurable via env var*: rejected; one default works for the project's
  current tool latency profile, and configurability without a use case is
  premature flexibility.

**Source**: spec.md FR-011 + Assumptions section.

## Decision 9 — Logging convention shared across both transports

**Decision**: All human-readable logs go to stderr in both modes. stdio
mode demands it (stdout is JSON-RPC); HTTP mode follows the same rule
defensively so a future refactor cannot accidentally re-introduce a
stdout-pollution bug in stdio mode.

**Rationale**: A single rule is easier to maintain than per-mode rules.
The cost of writing to stderr in HTTP mode is zero (Coolify and Docker
capture both streams).

**Source**: spec.md NFR-003, FR-002, FR-013, edge-case "stdout pollution".

## Decision 10 — Test strategy: live child-process integration tests

**Decision**: Each user story is verified by spawning the MCP server in a
real child process via a small `tests/helpers/spawn-server.ts` helper, then
exercising the live transport. No mocks of `StreamableHTTPServerTransport`
or `StdioServerTransport`.

**Rationale**: The whole point of this feature is the wire-protocol
behavior of two transports; mocking the transports would prove only that
our config-parsing branches the right way, not that the protocol actually
works. Live spawning catches real regressions (e.g., stdout pollution,
port-binding behavior, signal handling) that mocks cannot.

**Alternatives considered**:
- *Mock the SDK transports*: rejected per the rationale above.
- *Drive the SDK in-process without spawning*: rejected because we cannot
  test signal handling or port-already-in-use without separate processes.
- *Defer to manual MCP Inspector check only*: rejected because that is not
  reproducible in CI and User Story 2 (no stdio regression) needs a
  guardrail that runs on every change.

**Source**: spec.md Verification Notes.
