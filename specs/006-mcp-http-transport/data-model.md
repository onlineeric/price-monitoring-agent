# Data Model: MCP Server HTTP Transport Mode

**Feature**: 006-mcp-http-transport
**Date**: 2026-05-03

This feature has **no database schema changes, no queue payload changes,
and no tool input/output contract changes**. The "data model" here covers
the runtime values the new code introduces — config, the health-probe
payload, and the per-request access-log record. Each section names the
shape, where it lives, and how it is validated.

## 1. `ServerConfig` (in-process value object)

**Where**: `apps/mcp-server/src/config.ts` (new file).
**Lifetime**: Constructed once at startup, immutable thereafter.
**Producer**: `loadConfig()` reads `process.env` and the `package.json`
version.
**Consumers**: `src/index.ts` (dispatcher), `src/transports/http.ts`
(reads port + version), `src/transports/stdio.ts` (no port).

| Field | Type | Source | Validation |
|---|---|---|---|
| `transport` | `"stdio" \| "http"` | `MCP_TRANSPORT` env (default `stdio`) | If env value is set and is not one of the two literals, `loadConfig()` throws and the process exits with a clear stderr message naming the offending value and the accepted set (FR-001, edge case "Misconfigured `MCP_TRANSPORT`"). |
| `httpPort` | `number` | `MCP_HTTP_PORT` env (default `3001`) | Must parse as a positive integer in `[1, 65535]`. Used only when `transport === "http"`. Invalid value → throw at startup. |
| `httpHost` | `"0.0.0.0"` (literal constant) | Hard-coded | No env override (Decision 4). |
| `version` | `string` | `package.json` `version` field | Read at startup; surfaced in `/health` and the startup log line. |
| `gracePeriodMs` | `10_000` (constant) | Hard-coded | Decision 8. |
| `requestTimeoutMs` | `30_000` (constant) | Hard-coded | Decision 5. |

**Validation strategy**: A small Zod schema in `config.ts` covers the two
env-driven fields (transport literal, port number range). Constants are
literal values and need no runtime validation.

## 2. `HealthResponse` (HTTP response body)

**Where**: Returned by `GET /health` in HTTP mode only.
**Producer**: `src/transports/http.ts`.
**Consumer**: Operators (Coolify health probe), curl smoke tests,
orchestrator container health checks.

| Field | Type | Source | Notes |
|---|---|---|---|
| `status` | `"ok"` | Constant | If the server can return *any* response, status is "ok". Future health checks (e.g., DB ping) would extend this enum. |
| `uptime` | `number` (seconds) | `(Date.now() - startedAtMs) / 1000` | Whole or fractional seconds; rounded to the nearest 0.001. |
| `version` | `string` | `ServerConfig.version` | Same string as the startup log and `package.json`. |
| `transport` | `"http"` | Literal | This endpoint exists only in HTTP mode, so the value is always `"http"`. Useful for confirming which transport answered the probe when logs are sparse. |

**Wire format**: `application/json; charset=utf-8`, HTTP 200, body
`JSON.stringify(HealthResponse)`.

**Example**:

```json
{
  "status": "ok",
  "uptime": 142.317,
  "version": "1.0.0",
  "transport": "http"
}
```

## 3. `AccessLogRecord` (per-request stderr line in HTTP mode)

**Where**: Emitted by `src/transports/http.ts` after each `POST /mcp`
finishes (success or failure). `GET /health` requests are NOT logged.
**Producer**: HTTP request handler.
**Consumer**: Humans tailing Coolify / Docker logs; future Phase 6.3
log-aggregation pipeline.

**Format**: A single human-readable line, one per request, written to
stderr via `console.error`. Not JSON; this matches the existing
`[mcp-server]` log style.

```
[mcp-server] http POST /mcp method=<jsonrpc-method> tool=<name|-> status=<code> ms=<duration>
```

| Field | Type | Source | Notes |
|---|---|---|---|
| `method` | `string` | The `method` field of the parsed JSON-RPC request body | Examples: `tools/list`, `tools/call`, `initialize`. `-` if the body cannot be parsed. |
| `tool` | `string \| "-"` | For `tools/call`, the tool's `name` argument; otherwise `-` | Used to distinguish per-tool latency in the log without re-parsing the body. |
| `status` | `number` | HTTP response status | `200` on success; `4xx`/`5xx` on failure. |
| `ms` | `number` | `Date.now() - requestStartedAt` | Integer milliseconds. |

**Out of band**: bodies, headers, query strings, and tool arguments
(other than the tool name) are NEVER logged (NFR-003).

## 4. `TransportMode` (startup-time enum)

**Where**: `src/index.ts` switches on `ServerConfig.transport` to call
either `runStdio(server, config)` or `runHttp(server, config)`.
**Lifetime**: One value per process.
**Persistence**: None.

This is not a data structure in its own right — it is a tagged union that
the dispatcher uses. Documented here so the test plan and the access log
have a noun to refer to.

## 5. `ShutdownState` (HTTP mode only, in-memory)

**Where**: Module-local in `src/transports/http.ts`.
**Lifetime**: Created at HTTP startup, mutated by the signal handler.
**Persistence**: None.

| Field | Type | Notes |
|---|---|---|
| `httpServer` | `http.Server` | The Node HTTP server instance. `httpServer.close()` stops accepting new connections. |
| `inflightRequests` | `Set<http.IncomingMessage>` | Optional — used only if we choose to actively count rather than rely on `server.close()`'s callback. The simpler approach of trusting `server.close()` to fire its callback when all sockets are idle is preferred; this field is listed only so the test plan can reference it if the simpler approach proves insufficient. |
| `shuttingDown` | `boolean` | Flips true on the first `SIGTERM`/`SIGINT`. New requests arriving after this point are rejected with `503 Service Unavailable` (defensive, since the listener should already be closed). |
| `forceExitTimer` | `NodeJS.Timeout` | A 10s `setTimeout` that calls `process.exit(0)` if drain has not completed. |

**Validation strategy**: This is internal runtime state, not user input.
Tests assert observable behavior (response delivered, exit code, stderr
log line) rather than poking at the state directly.

## Out of Scope (explicit non-data-model items)

- **MCP tool definitions**: unchanged. Same Zod schemas in `apps/mcp-server/
  src/tools/*.ts`. Same `_wrap.ts` error envelope.
- **Database schema**: unchanged. No migration.
- **BullMQ queue payload**: unchanged.
- **`StreamableHTTPServerTransport` internal session map**: not used —
  stateless mode means no session state lives in this process.
- **MCP client (`apps/web/src/lib/mcp/client.ts`)**: not modified by this
  spec; task 3.10 swaps its transport.
