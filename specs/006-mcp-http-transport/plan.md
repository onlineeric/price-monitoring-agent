# Implementation Plan: MCP Server HTTP Transport Mode

**Branch**: `006-mcp-http-transport` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-mcp-http-transport/spec.md`

## Summary

Add a second transport mode to `apps/mcp-server/` so the MCP protocol can be
served over HTTP in addition to the existing stdio transport. The choice is
made at startup from `MCP_TRANSPORT` (default `stdio`); when `http`, the
server listens on `MCP_HTTP_PORT` (default `3001`) bound to `0.0.0.0`, exposes
`POST /mcp` (delegated to the SDK's `StreamableHTTPServerTransport` in
**stateless mode**) and `GET /health` (`{ status, uptime, version,
transport }`). HTTP mode also adds a 30s per-request timeout, a 10s graceful-
shutdown drain on `SIGTERM`/`SIGINT`, and one access-log line per `POST /mcp`
to stderr. The technical approach refactors `src/index.ts` into a transport
dispatcher plus `src/transports/{stdio,http}.ts`, keeps the existing tool
registry and `_wrap.ts` error envelope unchanged, and uses Node's built-in
`node:http` for the two-endpoint router so no new framework dependency is
introduced. Stdio mode is fully preserved so existing IDE integrations
continue to work without configuration changes.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 20 (`node:20-alpine` in
production via the same image base used by the worker).
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.29.0
(ships `StreamableHTTPServerTransport` and `StdioServerTransport`), `zod`
^4.3.6, `@price-monitor/db` (workspace), `bullmq` + `ioredis` (existing for
`add_product` tool). Node standard library `node:http` for the two-endpoint
router. **No new runtime dependency is added by this feature.**
**Storage**: PostgreSQL via existing Drizzle queries inside the unchanged
tools; Redis via existing BullMQ for `add_product`. No schema or queue
contract changes.
**Testing**: Vitest. The MCP server package does not currently have Vitest
configured; this plan adds it (matches `apps/web/` setup) so the four
integration tests (one per user story) can run via `pnpm --filter
@price-monitor/mcp-server test`.
**Target Platform**: Linux containers (Coolify on DigitalOcean in production)
+ Linux/WSL local development. IDE integration runs on developer host
machines (macOS / Windows / Linux) via stdio.
**Project Type**: Microservice with two interaction modes — long-running HTTP
service (production) and short-lived stdio child process (IDE / inspector).
**Performance Goals**: `GET /health` < 50 ms on `localhost`. HTTP-mode
`tools/list` and `tools/call` round-trip latency within ~10 ms of stdio-mode
latency for the same call. 30-second hard timeout per `POST /mcp` request;
10-second graceful-shutdown drain.
**Constraints**: stdout MUST stay JSON-RPC-only on stdio (all logs to
stderr); no new HTTP framework dependency (FR-015); listener MUST bind
`0.0.0.0`; stateless HTTP only (`sessionIdGenerator: undefined`); access log
MUST NOT include request bodies / tool arguments (NFR-003).
**Scale/Scope**: One MCP server instance per environment in this phase;
stateless design enables future horizontal scaling without revisiting the
transport. Five tools (`search_products`, `get_product_history`,
`get_price_summary`, `add_product`, `ping`).

## Constitution Check

- **Architecture Fit**: PASS. All changes stay within the existing
  `apps/mcp-server/` boundary. No new package, no new app, no new runtime.
  The web-side client switch (task 3.10) and Docker / Coolify wiring (tasks
  3.11–3.18) are intentionally out of scope for this spec, so this plan does
  not touch `apps/web/`, `apps/worker/`, or `packages/db/`.
- **Typed Maintainability**: PASS. The transport dispatcher and each
  transport module are single-purpose TypeScript files with explicit types.
  HTTP routing uses a tiny `node:http` switch (two endpoints) — no ad hoc
  parsing. Env parsing is centralized in `src/config.ts` with a typed shape.
  The MCP SDK is the purpose-built library doing the JSON-RPC work; we do
  not re-implement framing.
- **Data Safety**: PASS. No persistence work in this feature. The existing
  tools (which do use Drizzle query builder) are imported unchanged. No
  raw-SQL exception is requested.
- **Verification Plan**: PASS. Each user story maps to one Vitest integration
  test that boots the server in a child process and exercises the live
  contract end-to-end:
  - US1 → `tests/http-transport.test.ts`: spawn with `MCP_TRANSPORT=http`,
    send `tools/list` + `tools/call:ping` over HTTP, assert parity with
    stdio.
  - US2 → `tests/stdio-transport.test.ts`: spawn with `MCP_TRANSPORT` unset,
    send `tools/list` on stdin, assert valid JSON-RPC on stdout and zero
    bytes on stdout from logs.
  - US3 → `tests/http-transport.test.ts`: assert `GET /health` returns 200
    with the documented JSON shape.
  - US4 → `tests/http-transport.test.ts`: begin a slow `tools/call`, send
    `SIGTERM`, assert in-flight response is delivered and exit code is 0.
  - Edge cases (port already in use, malformed JSON-RPC, unknown route,
    misconfigured `MCP_TRANSPORT`, per-request 30s timeout) covered by
    additional cases in the same two test files.
  Manual end-to-end check (MCP Inspector against both transports + chat-side
  smoke test pointing at HTTP) is a Phase 5 task in tasks.md.
- **Operational Readiness**: PASS.
  - **New env vars**: `MCP_TRANSPORT` (default `stdio`), `MCP_HTTP_PORT`
    (default `3001`). Documented in `apps/mcp-server/README.md` update and
    flagged for `docs/production-env.md` in task 3.21 (out of this spec).
  - **Logging**: stderr-only convention preserved in both modes; one
    startup line per process; one access-log line per `POST /mcp` in HTTP
    mode (excludes `/health`); existing `_wrap.ts` error logs unchanged.
  - **Graceful shutdown**: `SIGTERM` and `SIGINT` handlers in HTTP mode;
    listener `close()` then 10s drain then forced exit. stdio mode keeps
    its current behavior (process exits when stdin closes).
  - **Failure modes**: clear fail-fast on (a) port already in use, (b)
    unrecognized `MCP_TRANSPORT`, (c) per-request 30s timeout. All emit
    actionable stderr messages.
  - **Deployment**: This spec only ships code. The Dockerfile,
    docker-compose entry, dev scripts, CI pipeline, and Coolify app are
    tasks 3.11–3.18 in the roadmap and out of scope here.

No constitution violations to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-http-transport/
├── plan.md              # This file
├── research.md          # Phase 0 — decision log for transport choices
├── data-model.md        # Phase 1 — runtime entities (Transport Mode, Health Probe Response, etc.)
├── quickstart.md        # Phase 1 — how to run + test both transports locally
├── contracts/           # Phase 1 — HTTP wire contracts
│   ├── http-mcp.md      # POST /mcp request/response contract
│   └── http-health.md   # GET /health response contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (already authored)
└── tasks.md             # Phase 2 (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/mcp-server/
├── src/
│   ├── index.ts                  # Transport dispatcher (refactored)
│   ├── config.ts                 # NEW — typed env parsing (transport, port, version)
│   ├── server.ts                 # NEW — McpServer creation + tool registration
│   ├── transports/
│   │   ├── stdio.ts              # NEW — stdio bootstrap (lifted from current index.ts)
│   │   └── http.ts               # NEW — node:http server, /mcp + /health, shutdown, timeout, access log
│   ├── queue.ts                  # UNCHANGED
│   └── tools/                    # UNCHANGED (search-products, get-product-history, get-price-summary, add-product, _wrap)
├── tests/
│   ├── http-transport.test.ts    # NEW — US1 + US3 + US4 + HTTP edge cases
│   ├── stdio-transport.test.ts   # NEW — US2 + stdout-purity assertion
│   └── helpers/
│       └── spawn-server.ts       # NEW — small helper to spawn the server with env, capture stderr, kill cleanly
├── vitest.config.ts              # NEW — minimal config (node env, 30s test timeout)
├── package.json                  # MODIFIED — add `vitest` dev dep + `test` script
├── tsconfig.json                 # UNCHANGED
└── README.md                     # MODIFIED — document HTTP-mode usage, env vars, MCP Inspector HTTP check
```

**Structure Decision**: The MCP server package gains three new files
(`config.ts`, `server.ts`, `transports/http.ts`) and one renamed/lifted
file (`transports/stdio.ts`), with `index.ts` becoming a 20-ish-line
dispatcher. This matches NFR-004's "transport-dispatching entry point + one
module per transport" requirement and isolates the new HTTP path from the
existing stdio path so a regression in one cannot affect the other. The
tool registry (`server.ts`) is extracted into a named function so both
transports share exactly the same set of registered tools (FR-007). Tests
live alongside source in `apps/mcp-server/tests/` to mirror the existing
`apps/web/` layout (Vitest discovers them via the new `vitest.config.ts`).
No new top-level directories are introduced; no new monorepo workspace is
created.

## Complexity Tracking

> No constitution violations to justify. Section intentionally left empty.
