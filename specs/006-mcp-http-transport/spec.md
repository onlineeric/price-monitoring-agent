# Feature Specification: MCP Server HTTP Transport Mode

**Feature Branch**: `006-mcp-http-transport`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "read @docs/AI-agent-mcp-server-idea.md and do phase 3.9."

## Clarifications

### Session 2026-05-03

- Q: Which network interface should the HTTP listener bind to? → A: Always bind `0.0.0.0` (single behavior, prod-ready, matches Docker port-mapping expectations in task 3.12)
- Q: What per-request HTTP timeout should the MCP server enforce on `POST /mcp`? → A: 30 seconds — fail fast at the MCP layer with a structured error so the chat-side 60s turn budget (spec 004 FR-011a) still has headroom to surface the failure
- Q: What per-request HTTP access logging should the server emit in HTTP mode? → A: One log line per `POST /mcp` (method, JSON-RPC method, duration, status); `/health` excluded to avoid orchestrator-probe spam
- Q: How should `GET /mcp` (the SDK's SSE upgrade path) be handled in stateless mode? → A: Delegate to the SDK's `StreamableHTTPServerTransport` natively; do not pre-intercept in our router

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Web app calls the MCP server as a separate HTTP service in production (Priority: P1)

In production, the web app runs in one container and the MCP server runs in
another container on a private internal network. Today the web app spawns the
MCP server as a stdio child process, which forces them to share a single
container, ties their lifecycles together, prevents independent scaling, and
makes the MCP server's health invisible to the orchestrator. After this
feature, the MCP server exposes its protocol over HTTP, so the web app talks
to it the same way any microservice talks to any other microservice — over a
URL on the internal network.

**Why this priority**: This is the entire purpose of Phase 3.9. Every task
that follows in the deployment sub-phase (Dockerfile, docker-compose entry,
CI/CD wiring, separate Coolify app, production cutover in 3.10–3.20) depends
on the MCP server being able to serve its protocol over a network port. Until
that exists, the MCP server cannot be deployed as an independent service at
all. This story unblocks the rest of the sub-phase.

**Independent Test**: Start the MCP server as a standalone process with
`MCP_TRANSPORT=http`, then drive it from any HTTP client (curl, MCP
Inspector's HTTP mode, the web app's MCP client) by posting JSON-RPC
requests to the MCP endpoint. Success looks like: (a) the server returns the
same tool list and tool-call results it would have returned over stdio, and
(b) the server is reachable from a separate process across the network
boundary, not just from a parent process that spawned it.

**Acceptance Scenarios**:

1. **Given** the MCP server is started with `MCP_TRANSPORT=http` and
   `MCP_HTTP_PORT=3001`, **When** an HTTP client sends a `tools/list`
   JSON-RPC request to the MCP endpoint, **Then** the response contains the
   same tool definitions (`search_products`, `get_product_history`,
   `get_price_summary`, `add_product`, `ping`) the stdio mode publishes.
2. **Given** the MCP server is running in HTTP mode, **When** an HTTP client
   sends a `tools/call` request for `ping`, **Then** the response carries the
   same `"pong"` content and structured error envelope the stdio path returns.
3. **Given** the MCP server is running in HTTP mode, **When** the web app's
   MCP client is configured to point at the HTTP endpoint instead of
   spawning a stdio subprocess, **Then** an end-to-end chat turn that
   triggers a tool call succeeds with no behavioral difference from the
   stdio path.

---

### User Story 2 — IDE-side stdio integration continues to work unchanged (Priority: P1)

Developers integrate the MCP server with VSCode/Cursor via the standard
stdio transport (Phase 1.6). That integration MUST keep working exactly as
it does today, with no new env vars to set, no new flags to pass, and no
behavioral change in the JSON-RPC frames the IDE sees on stdout. A
developer who has already configured the MCP server in their IDE before
this feature lands MUST find it still working after this feature lands
without touching their IDE config.

**Why this priority**: stdio is the developer-experience path. Breaking it
silently breaks the local debugging story for every contributor and removes
the inspector workflow the project relies on. Treating "no regression" as
P1 forces the design to be additive rather than substitutive — the new
HTTP path is a sibling of stdio, not a replacement.

**Independent Test**: Without setting `MCP_TRANSPORT`, run the MCP server
exactly as the IDE does (the existing `pnpm --filter
@price-monitor/mcp-server start` command). Send a `tools/list` JSON-RPC
frame on stdin and verify a complete JSON-RPC response is written to
stdout. Run MCP Inspector's stdio mode against the same command and
verify the tool list and a sample `ping` call still work.

**Acceptance Scenarios**:

1. **Given** `MCP_TRANSPORT` is unset, **When** the MCP server process
   starts, **Then** it connects a stdio transport (no HTTP listener is
   opened, no port is bound) and writes a startup log line to stderr.
2. **Given** the server is running in stdio mode, **When** any code path
   in the server logs informational or error output, **Then** that output
   is written to stderr only — stdout MUST remain reserved for JSON-RPC
   frames (a regression here corrupts the protocol stream).
3. **Given** an existing IDE MCP configuration that points at the
   server's `start` script, **When** the developer reloads the IDE after
   pulling this change, **Then** the IDE's MCP integration lists and
   invokes tools with no configuration edit required.

---

### User Story 3 — Operators and orchestrators can health-check the HTTP MCP server (Priority: P2)

When the MCP server runs as an independent service in production, the
orchestrator (Coolify, Docker, a load balancer) needs a cheap, dependency-
free way to ask "is this process alive and serving traffic?" without having
to construct a JSON-RPC frame. A plain HTTP GET against a well-known path
must return a small JSON document describing the server's identity and
liveness, suitable for use as a container health check.

**Why this priority**: P1 covers the protocol path. P2 covers the
operability path. Without a health endpoint, the orchestrator cannot
distinguish a hung process from a healthy one, restart policies become
unreliable, and Phase 3.18 cannot configure the Coolify health check at
all. This must ship with the HTTP transport so the deployment tasks that
follow have something to point at.

**Independent Test**: With the server running in HTTP mode, send `GET
/health` from any HTTP client and verify the response has status 200 and
a JSON body with the documented fields. Stop the server and verify the
request now fails to connect — confirming the endpoint is genuinely tied
to process liveness, not a static asset.

**Acceptance Scenarios**:

1. **Given** the server is running in HTTP mode, **When** an HTTP client
   sends `GET /health`, **Then** the response is HTTP 200 with a JSON body
   containing `status`, `uptime`, `version`, and `transport` fields.
2. **Given** the server is running in stdio mode (no HTTP listener), **When**
   an HTTP client tries to reach `/health` on the documented port,
   **Then** the connection fails (no listener bound) — the health endpoint
   does not exist outside HTTP mode.
3. **Given** the orchestrator has the health endpoint configured as a
   container health check, **When** the MCP process crashes or hangs,
   **Then** the orchestrator observes the failed health probe and can act
   on it (restart, mark unhealthy, etc.).

---

### User Story 4 — Graceful shutdown on SIGTERM (Priority: P2)

When the orchestrator deploys a new image, it sends `SIGTERM` to the
running MCP container and expects the process to finish in-flight work and
exit cleanly within a short grace window. If the process exits
immediately, in-flight tool calls (a chat user mid-question) are dropped
and the chat surfaces an error. The HTTP transport MUST stop accepting new
requests on `SIGTERM`, drain in-flight requests with a bounded timeout,
then exit.

**Why this priority**: This is the difference between a "feels professional"
deploy and a "every deploy drops a chat" deploy. It is not blocking — the
service technically works without it — but it is cheap to add at the same
time as the HTTP transport, and adding it later means re-touching the same
files. P2 reflects "do it now while you're already there".

**Independent Test**: Start the HTTP MCP server. Begin a long-running tool
call (e.g., one that hits the database). While the call is in flight, send
the process `SIGTERM`. Verify: (a) the in-flight call completes and its
response reaches the client, (b) any new request that arrives after the
signal is rejected or refused immediately, and (c) the process exits with
code 0 within the grace window.

**Acceptance Scenarios**:

1. **Given** the HTTP MCP server is serving traffic, **When** the process
   receives `SIGTERM`, **Then** the HTTP listener stops accepting new
   connections and a "shutting down" log line is written to stderr.
2. **Given** at least one request is in flight when `SIGTERM` arrives,
   **When** the shutdown sequence runs, **Then** the in-flight request's
   response is delivered to its client before the process exits.
3. **Given** the shutdown sequence has been triggered, **When** the
   bounded grace window elapses without all requests finishing, **Then**
   the process exits anyway rather than hanging forever.

---

### Edge Cases

- **Port already in use**: If `MCP_HTTP_PORT` is already bound by another
  process, the server MUST fail fast on startup with a clear error
  identifying the port and the failure reason — never silently fall back to
  a different port and never silently fall back to stdio.
- **Malformed JSON-RPC over HTTP**: A `POST /mcp` body that is not valid
  JSON, or is valid JSON but not a valid JSON-RPC frame, MUST yield an
  HTTP-level error response (e.g., 400) without crashing the server.
- **Unknown HTTP route**: A request to any path other than the two
  documented endpoints MUST return 404 (not 200, not the JSON-RPC error
  envelope) — this keeps the surface area explicit.
- **Wrong HTTP method on a known route**: `POST /health` MUST return 405
  Method Not Allowed (enforced by our router). Requests to `/mcp` with
  methods other than `POST` (notably `GET`, which the SDK's
  `StreamableHTTPServerTransport` reserves for SSE upgrades) MUST be
  delegated to the SDK transport rather than pre-intercepted; the SDK
  returns the appropriate protocol-level response for stateless mode
  (typically 405 or an immediately-closed empty stream). Our router
  MUST NOT short-circuit `GET /mcp`, so future SDK behavior changes
  remain authoritative.
- **Hung tool call**: If a tool invocation hangs (Postgres unresponsive,
  Redis stuck), the per-request timeout in FR-011a MUST fire so the
  socket is released and the chat-side budget is not consumed by a
  zombie request. The timeout response uses the same structured error
  shape as other MCP failures.
- **Misconfigured `MCP_TRANSPORT`**: A value other than `stdio` or `http`
  (typo, leftover env from another environment) MUST cause the process to
  fail fast on startup with a clear error naming the offending value and
  the accepted set, rather than defaulting silently.
- **stdout pollution risk in HTTP mode**: stdio mode demands stdout stay
  pure JSON-RPC. HTTP mode has no such restriction, but a single shared
  logger MUST NOT introduce a regression where, for example, a future
  refactor accidentally routes startup logs to stdout in stdio mode. The
  rule "all human-readable logs go to stderr" applies in both modes.
- **Large response bodies**: Some MCP tool calls (e.g.,
  `get_product_history` with a wide range) can return large JSON payloads.
  HTTP mode MUST NOT impose a tighter result-size cap than stdio mode does
  today; result sizing remains the responsibility of each MCP tool's own
  schema (consistent with FR-004 of spec 004).
- **Concurrent requests**: Multiple chat turns from multiple users will
  arrive at the HTTP endpoint at the same time. The server MUST handle
  concurrent requests safely — no shared mutable state across requests
  that would cause one request's result to leak into another's response.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server MUST select its transport at startup based on
  the `MCP_TRANSPORT` environment variable, with values `stdio` (default
  when unset) and `http`. Any other value MUST cause the process to fail
  fast on startup with a clear error.
- **FR-002**: When `MCP_TRANSPORT=stdio`, the server MUST behave exactly as
  it does today: connect a stdio transport, reserve stdout for JSON-RPC
  frames, and route all human-readable logs to stderr. No HTTP listener is
  opened in this mode.
- **FR-003**: When `MCP_TRANSPORT=http`, the server MUST expose the MCP
  protocol over HTTP via the SDK's `StreamableHTTPServerTransport` on the
  port given by `MCP_HTTP_PORT` (default `3001`). The listener MUST bind
  to `0.0.0.0` (all interfaces) so the container is reachable from peer
  containers on the orchestrator's internal network. The access boundary
  is provided by the network topology (no public domain in production,
  developer laptop in local dev), not by the bind address.
- **FR-004**: The HTTP MCP endpoint MUST be served at `POST /mcp`.
  Requests to `/mcp` using HTTP methods other than `POST` MUST be
  forwarded to the SDK's `StreamableHTTPServerTransport`, which returns
  the appropriate protocol-level response for stateless mode; the
  router MUST NOT pre-intercept these so SDK upgrades remain
  authoritative. Any path other than the two documented endpoints
  (`/mcp`, `/health`) MUST return 404.
- **FR-005**: The HTTP transport MUST operate in **stateless mode** — every
  tool call is treated as a self-contained request/response with no
  per-session state retained between calls. This is a deliberate choice
  because the project's MCP tools are themselves stateless (each one is
  an independent database query or job enqueue), and statelessness keeps
  the service horizontally scalable behind any future load balancer
  without sticky-session concerns.
- **FR-006**: The HTTP server MUST expose `GET /health` returning HTTP 200
  with a JSON body of shape `{ status: "ok", uptime: <seconds since
  process start>, version: <string from package.json>, transport: "http" }`.
  The `/health` endpoint MUST be served only when the server is in HTTP
  mode (it does not exist in stdio mode).
- **FR-007**: The same tool registry (the four real tools plus `ping`) MUST
  be exposed through both transports — the transport choice is purely a
  wire-protocol concern and MUST NOT alter the set of tools, their input
  schemas, or their output shapes.
- **FR-008**: All structured tool errors MUST keep flowing through the
  existing `tools/_wrap.ts` wrapper unchanged in either transport. The
  `{ error: { code, message } }` shape that web/chat already depends on is
  contract-stable across this change.
- **FR-009**: When `MCP_HTTP_PORT` is already bound by another process,
  the server MUST log a clear error naming the port and the failure
  reason, then exit with a non-zero status. It MUST NOT silently choose a
  different port and MUST NOT silently fall back to stdio.
- **FR-010**: A malformed request to `POST /mcp` (invalid JSON, valid JSON
  but not a JSON-RPC frame) MUST result in an HTTP error response without
  crashing the process and without consuming server-side resources beyond
  the failed request.
- **FR-011**: On `SIGTERM`, the HTTP transport MUST stop accepting new
  connections immediately, allow in-flight requests to finish within a
  bounded grace window of **10 seconds**, then exit. If the grace window
  elapses with requests still in flight, the process MUST exit anyway
  rather than hang.
- **FR-011a**: The HTTP transport MUST enforce a **30-second per-request
  timeout** on `POST /mcp`. If a tool invocation has not completed within
  30 seconds, the server MUST abort it and respond with a structured
  error (`{ error: { code: "request_timeout", message: ... } }`)
  consistent with the Phase 2.6 wrapper shape, rather than holding the
  socket open. This bound is independent of the shutdown grace window in
  FR-011 and of the chat-side 60-second per-turn timeout in spec 004
  (FR-011a); the tighter MCP-layer bound exists so a hung tool does not
  consume the entire chat-turn budget before the chat side can surface
  the failure.
- **FR-012**: On `SIGINT` (developer Ctrl+C in HTTP mode), the server
  MUST follow the same graceful-shutdown sequence as `SIGTERM` so local
  development behaves the same as production.
- **FR-013**: The server MUST emit a one-line startup log to stderr that
  identifies the active transport — for example `[mcp-server]
  price-monitor-mcp-server ready on http :3001` or `[mcp-server]
  price-monitor-mcp-server ready on stdio`. Operators reading container
  logs use this line to confirm transport selection at a glance.
- **FR-013a**: In HTTP mode, the server MUST emit one access-log line per
  `POST /mcp` request to stderr containing: HTTP method, JSON-RPC method
  name (e.g., `tools/list`, `tools/call:search_products`), duration in
  milliseconds, and HTTP status code. `GET /health` requests MUST NOT be
  logged, to keep orchestrator probe traffic out of the log stream. The
  log line MUST NOT include the request body or tool arguments (which
  may contain user search terms).
- **FR-014**: The HTTP transport MUST handle concurrent requests without
  introducing any cross-request data leakage. Two simultaneous tool calls
  from different clients MUST receive their own correct responses.
- **FR-015**: The server MUST NOT introduce a new HTTP framework
  dependency for this feature; the routing surface is two endpoints
  (`POST /mcp`, `GET /health`) and the standard library's HTTP server is
  sufficient. Any future dependency addition for HTTP routing belongs in
  a follow-up spec, not this one.

### Non-Functional Requirements

- **NFR-001**: HTTP-mode `tools/list` and `tools/call` round-trip latency
  on `localhost` MUST be within ~10 ms of stdio-mode latency for the same
  call (i.e., the transport overhead is not a meaningful contributor to
  end-to-end chat latency). This is a "no regression" guardrail, not a
  performance goal in its own right.
- **NFR-002**: The HTTP transport MUST NOT cap individual response bodies
  more tightly than stdio mode does. Tool-result sizing remains the
  responsibility of each tool's own schema.
- **NFR-003**: The server MUST NOT log secrets (DB URL with credentials,
  API keys), raw request bodies, or full stack traces to either stdout or
  stderr in either mode. Operational logs identify what happened, not
  what was inside the request.
- **NFR-004**: Refactoring `src/index.ts` to support two transports MUST
  result in a clear file layout — a transport-dispatching entry point and
  one module per transport (e.g., `src/transports/stdio.ts`,
  `src/transports/http.ts`) — so future maintainers can reason about each
  path independently.

## Technical and Operational Constraints *(mandatory)*

- **Affected Boundaries**: `apps/mcp-server/` only. No changes to
  `apps/web/`, `apps/worker/`, or `packages/db/` are required by this
  spec — the web-side client switch is the separate task 3.10, and the
  Dockerfile / docker-compose / CI / Coolify wiring lives in 3.11–3.18.
  This spec deliberately stops at "the MCP server can serve its protocol
  over HTTP" so each downstream task has a single, narrow concern.
- **Data and Contracts Impact**: No database schema changes. No BullMQ
  queue changes. No tool input/output contract changes. The MCP protocol
  contract is unchanged — the same `tools/list` / `tools/call` JSON-RPC
  frames that travel over stdio today travel over HTTP after this change.
  The new external contracts introduced by this feature are: (a) the
  `POST /mcp` HTTP endpoint shape (a thin wrapper around the existing
  JSON-RPC frames), and (b) the `GET /health` JSON response shape
  documented in FR-006.
- **Operational Impact**:
  - Two new env vars on the MCP server: `MCP_TRANSPORT` (default `stdio`)
    and `MCP_HTTP_PORT` (default `3001`, used only when transport is
    `http`).
  - No change to existing env vars (`DATABASE_URL`, `REDIS_URL`).
  - Stdio mode is the default so no existing IDE configuration breaks.
  - HTTP mode opens a network listener — in production this listener is
    expected to be reachable only on the internal Coolify network (no
    public domain, no TLS termination at this layer). That posture is
    enforced by the Coolify configuration in task 3.18, not by this code.
  - Graceful shutdown on `SIGTERM` improves deployment ergonomics; the
    grace window is bounded so a stuck request cannot block a deploy.
  - Logging contract: stdio mode keeps the strict "stderr only" rule;
    HTTP mode is allowed to log to stderr but MUST NOT log to stdout in
    a way that would corrupt stdio mode after a future refactor — the
    safest convention is "always stderr, in both modes".
- **Verification Notes**:
  - User Story 1 (HTTP transport works) is verified by an automated
    integration test that boots the server in HTTP mode in a child
    process, sends `tools/list` and a `tools/call` for `ping`, and
    asserts on the responses. The same test re-runs against stdio mode to
    prove parity.
  - User Story 2 (stdio no regression) is verified by the existing MCP
    Inspector workflow plus an automated test that boots the server with
    `MCP_TRANSPORT` unset, sends a JSON-RPC frame on stdin, and asserts a
    valid JSON-RPC response on stdout.
  - User Story 3 (health endpoint) is verified by an automated test that
    asserts on the HTTP status code and the JSON body shape.
  - User Story 4 (graceful shutdown) is verified by an automated test
    that begins a slow tool call, sends `SIGTERM`, and asserts the
    in-flight call's response is delivered before the process exits.
  - Manual end-to-end verification: run the web app with the MCP client
    pointed at the HTTP endpoint, send a chat message that triggers a
    tool call, confirm the answer is grounded in real DB data — this
    rehearses the production wiring end to end before task 3.10 lands.

### Key Entities

- **Transport Mode**: A startup-time selection between `stdio` and `http`,
  derived from `MCP_TRANSPORT`. Determines which transport the SDK's
  `Server` instance is connected to. Not persisted; emitted in logs and
  in the `/health` response.
- **HTTP MCP Endpoint**: The `POST /mcp` route through which JSON-RPC
  frames flow when the server is in HTTP mode. Conceptually a thin
  wire-protocol shim — it does not interpret the frames itself, it hands
  them to the SDK transport.
- **Health Probe Response**: The JSON document returned by `GET /health`.
  Attributes: `status`, `uptime`, `version`, `transport`. Consumed by
  orchestrators and by humans tailing container logs after a deploy.
- **Shutdown Sequence**: The sequence triggered by `SIGTERM`/`SIGINT` in
  HTTP mode — stop the listener, drain in-flight requests within a
  bounded window, exit. Not an entity in the data sense; named here so
  the verification plan has a noun to reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With `MCP_TRANSPORT=http`, an HTTP client can list tools and
  successfully invoke each of the five tools (`search_products`,
  `get_product_history`, `get_price_summary`, `add_product`, `ping`) and
  receive the same responses the stdio path returns for equivalent inputs
  — verified by an automated test that runs both transports against the
  same test inputs.
- **SC-002**: With `MCP_TRANSPORT` unset (or set to `stdio`), every
  pre-existing MCP Inspector and IDE workflow continues to succeed with
  zero configuration changes — verified by re-running the Phase 1.5 / 1.6
  manual checks unchanged.
- **SC-003**: `GET /health` against a running HTTP-mode server returns
  HTTP 200 with the documented JSON body in under **50 ms** on
  `localhost`, suitable for use as an orchestrator health probe at
  default intervals.
- **SC-004**: A graceful-shutdown rehearsal (start server, begin a tool
  call, send `SIGTERM`) completes with the in-flight call's response
  successfully delivered to its client and the process exit code being 0
  in at least 95% of trials within the bounded grace window.
- **SC-005**: When `MCP_HTTP_PORT` is occupied by another process, the
  server exits with a non-zero code within **2 seconds** of startup and
  the stderr output names the port and the bind failure — verified by an
  automated test that pre-binds the port before launching the server.
- **SC-006**: The downstream tasks 3.10 (web client transport switch),
  3.11 (Dockerfile), and 3.12 (docker-compose entry) can be authored
  against the contracts defined in this spec without requiring any change
  to this code — i.e., this spec produces a stable, complete contract for
  the rest of the sub-phase to build on.

## Assumptions

- The MCP SDK version pinned in `apps/mcp-server/package.json`
  (`@modelcontextprotocol/sdk` ^1.29.0) ships
  `StreamableHTTPServerTransport`. If a future SDK upgrade renames or
  removes this transport, that is a separate migration concern and not
  scoped here.
- The MCP tools themselves are stateless across calls (each tool opens its
  DB connection / enqueues its job and returns). This is what makes the
  stateless-HTTP choice safe; if a future tool needs cross-call state
  (e.g., a streaming subscription), that tool's spec must revisit the
  stateless decision rather than this one.
- This spec covers code in `apps/mcp-server/` only. The web app's
  preference for the HTTP transport when `MCP_HTTP_URL` is set is task
  3.10's concern. The Dockerfile, docker-compose entry, dev scripts, CI
  build step, and Coolify app creation are tasks 3.11–3.18.
- The HTTP listener is internal-only in production. No authentication or
  authorization is added in this spec because the network boundary
  (Coolify internal network, no public domain) provides the access
  control. If the MCP server is ever exposed publicly, an auth layer must
  be added before that exposure happens — that is a future spec, not this
  one.
- The 10-second graceful-shutdown grace window (FR-011) is chosen as a
  reasonable default for the project's actual tool latency profile (every
  tool is either a single Drizzle query or a BullMQ enqueue, all of which
  complete in well under 10 seconds). If a future tool is meaningfully
  slower, the window may need to grow — that revisit belongs with that
  tool's spec.
- Logs continue to use plain `console.error` calls (consistent with the
  current `src/index.ts`). Structured logging or tracing instrumentation
  is Phase 6.3 and not a dependency of this feature.
