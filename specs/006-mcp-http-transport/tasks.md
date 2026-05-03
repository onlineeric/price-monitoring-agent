# Tasks: MCP Server HTTP Transport Mode

**Input**: Design documents from `/specs/006-mcp-http-transport/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. The spec's verification plan (Verification Notes) and
constitution principle IV (Independent, Risk-Proportional Verification) call
for one automated integration test per user story; these are written as live
child-process tests (no SDK mocks) per research.md Decision 10.

**Organization**: Tasks are grouped by user story so each story can be
implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1 / US2 / US3 / US4); omitted for setup, foundational, and polish phases

## Path Conventions

All paths are relative to repository root `/home/onlineeric/repos/price-monitoring-agent/`. The feature is bounded to `apps/mcp-server/` (plan.md Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the test infrastructure the rest of the work depends on. The MCP server package does not currently have Vitest configured.

- [x] T001 Add `vitest` `^3.2.4` (matches `apps/web/`) to `devDependencies` and a `"test": "vitest run"` script in `apps/mcp-server/package.json`. Run `pnpm install` at the repo root to update the lockfile.
- [x] T002 [P] Create `apps/mcp-server/vitest.config.ts` with: `environment: "node"`, `testTimeout: 30000` (graceful-shutdown test needs the full 10s drain plus headroom), `hookTimeout: 30000`, `globals: false`, include pattern `tests/**/*.test.ts`.
- [x] T003 [P] Create `apps/mcp-server/tests/helpers/spawn-server.ts` exposing `spawnServer({ env, args })` that spawns `tsx src/index.ts` as a child process via `node:child_process.spawn`, captures stderr lines (split by `\n`), exposes `kill(signal)`, `waitForStderr(predicate, timeoutMs)`, and an async `close()` that sends SIGTERM and awaits exit. Used by both transport test files.

**Checkpoint**: `pnpm --filter @price-monitor/mcp-server test` runs (with zero tests) and the spawn helper is importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Refactor the existing single-file server into the dispatcher + per-transport layout that NFR-004 requires. After this phase the existing stdio behavior is preserved exactly (no functional change yet) and the file structure is in place for both user stories to build on.

**⚠️ CRITICAL**: All four user stories depend on this phase. No user-story work begins until the dispatcher compiles and stdio still works.

- [x] T004 Create `apps/mcp-server/src/config.ts` exporting `loadConfig(): ServerConfig` per data-model.md §1. Uses Zod to validate `MCP_TRANSPORT` (literal `"stdio" | "http"`, default `"stdio"`) and `MCP_HTTP_PORT` (integer 1–65535, default `3001`). Reads `version` from `package.json` (use `import pkg from "../package.json" with { type: "json" }`). Hard-codes `httpHost = "0.0.0.0"` and `gracePeriodMs = 10_000`. `requestTimeoutMs` defaults to `30_000` but reads from optional `MCP_REQUEST_TIMEOUT_MS` env var when set (positive integer 1–600_000) — this is a test-only override consumed by the integration tests in T010(g)/T025; do not advertise it in the README. Throws a `ConfigError` with a clear message on invalid input; the dispatcher converts that into a fatal stderr line and `process.exit(1)`.
- [x] T005 Create `apps/mcp-server/src/server.ts` exporting `createServer(): McpServer`. Lifts the `new McpServer(...)` construction and the five `register*` calls (including the inline `ping` tool) out of `src/index.ts`. Both transports import this so the tool set is identical (FR-007). **Additionally**, when `process.env.MCP_TEST_TOOLS === "1"`, register a `slow_ping` tool that takes `{ ms: number }`, `await`s `setTimeout(ms)`, then returns `"slow pong"`. This test-only tool exists solely to drive the per-request-timeout test (T010 case g) and the graceful-shutdown drain tests (T025 cases a and d) without coupling them to real DB/Redis state. Production deploys never set `MCP_TEST_TOOLS`, so this tool is invisible to chat traffic. Document the env var inline with a one-line comment.
- [x] T006 Create `apps/mcp-server/src/transports/stdio.ts` exporting `async function runStdio(server: McpServer, config: ServerConfig): Promise<void>`. Lifts the current `StdioServerTransport` connect + the existing startup log line `[mcp-server] price-monitor-mcp-server ready on stdio` from `src/index.ts`. No behavioral change — this is a verbatim move.
- [x] T007 Create `apps/mcp-server/src/transports/http.ts` exporting `async function runHttp(server: McpServer, config: ServerConfig): Promise<void>` as a stub that throws `new Error("HTTP transport not yet implemented")`. Real implementation lands in US1 (T010–T015). Stub keeps the dispatcher type-safe.
- [x] T008 Rewrite `apps/mcp-server/src/index.ts` as a thin dispatcher: `loadConfig()` → wrap any `ConfigError` into a fatal stderr message + `process.exit(1)` → `createServer()` → switch on `config.transport` to `await runStdio(...)` or `await runHttp(...)`. Top-level `await` is fine (existing file already uses it). Catch any unhandled error from `runHttp`/`runStdio`, log to stderr, exit non-zero.
- [x] T009 Manual sanity check: run `pnpm --filter @price-monitor/mcp-server start` and confirm the stderr line is unchanged and stdin still accepts a JSON-RPC frame. (No automated test yet — that lands in US2.)

**Checkpoint**: The package builds, stdio mode behaves exactly as before this feature, HTTP mode throws a clear "not yet implemented" error if invoked.

---

## Phase 3: User Story 1 — Web app calls the MCP server as a separate HTTP service (Priority: P1) 🎯 MVP

**Goal**: `MCP_TRANSPORT=http` boots a working HTTP MCP server that serves the same tool set over `POST /mcp`.

**Independent Test**: Spawn the server with `MCP_TRANSPORT=http`, post a JSON-RPC `tools/list` to `http://localhost:3001/mcp`, and verify the response matches what stdio mode returns for the same call. Bonus: post `tools/call` for `ping` and verify `"pong"` text.

### Verification for User Story 1 ⚠️

- [x] T010 [US1] Author `apps/mcp-server/tests/http-transport.test.ts` with these cases (initially failing). Use the `spawnServer` helper from T003; spawn with `MCP_TEST_TOOLS=1` for cases that need the `slow_ping` tool (g, plus T025 a/d).
  - (a) `tools/list` over HTTP returns the five expected tool names (`search_products`, `get_product_history`, `get_price_summary`, `add_product`, `ping`).
  - (b) `tools/call` for `ping` with `{ count: 3 }` returns `"pong pong pong"`.
  - (c) `POST /mcp` with malformed JSON yields HTTP 400 and the process stays up (subsequent valid request still works).
  - (d) `GET /unknown` yields HTTP 404 with body `Not Found`.
  - (e) `POST /health` yields HTTP 405 with `Allow: GET` header.
  - (f) Pre-bind `MCP_HTTP_PORT` with a small `net.createServer().listen(...)`, then spawn the MCP server. Assert the child exits with code ≠ 0 within **2 seconds** and stderr contains both the port and `EADDRINUSE`.
  - (g) **Per-request 30 s timeout** (FR-011a): spawn with `MCP_TEST_TOOLS=1`. To keep the test fast, override the timeout via `MCP_REQUEST_TIMEOUT_MS=200` (test-only env hook — see T014). Call `slow_ping` with `{ ms: 1000 }`. Assert HTTP 504, body `{"error":{"code":"request_timeout","message":...}}`, and the process is still healthy afterward (subsequent `ping` succeeds).
  - (h) **Concurrent isolation** (FR-014): fire two `tools/call` requests simultaneously with distinct arguments (e.g., `ping` `count: 2` and `ping` `count: 5`); assert each response carries its own correct text (`"pong pong"` and `"pong pong pong pong pong"`).
  - (i) **Misconfigured `MCP_TRANSPORT`** (resolves analyze finding C1; spec edge case): spawn with `MCP_TRANSPORT=foo`. Assert exit code ≠ 0 within **1 second** and stderr contains the literal `foo` and the accepted set (`stdio`, `http`).
  - (j) **Cross-transport parity** (resolves C2; FR-007 / SC-001): spawn one stdio child and one HTTP child in the same test, send `tools/list` to both, parse both responses, and assert `expect(httpResult.tools).toEqual(stdioResult.tools)`. Repeat for `tools/call:ping count:3`.
  - (k) **Access-log line format** (resolves C3; FR-013a): capture stderr for the duration of one `tools/call:ping` request, assert at least one line matches the regex `/^\[mcp-server\] http POST \/mcp method=tools\/call tool=ping status=200 ms=\d+$/`. Then perform a `GET /health` and assert NO stderr line was added for it.
  - (l) **HTTP startup log** (resolves C5; FR-013): assert `spawnServer.waitForStderr(/ready on http :\d+/, 2000)` resolves within 2 s of spawn.
  - (m) **GET /mcp delegation to SDK** (resolves C6; FR-004 / Decision 7): send `GET /mcp` and assert the response shape comes from `StreamableHTTPServerTransport` (the SDK's stateless-mode default — typically a 405 with a JSON-RPC-style error body or an immediately-closed empty stream), NOT our router's plain-text `Method Not Allowed`. The exact assertion is: response is NOT `405 Method Not Allowed` with body `Method Not Allowed` (which would prove our router pre-intercepted).
  - (n) **Tool error envelope round-trip** (resolves C7; FR-008): call `add_product` with an obviously invalid URL (e.g., `"not-a-url"`) and assert the JSON-RPC response carries `result.isError === true` and `result.content[0].text` parses to `{ error: { code, message } }` matching the existing `_wrap.ts` shape.

### Implementation for User Story 1

- [x] T011 [US1] In `apps/mcp-server/src/transports/http.ts`, implement the core HTTP server using `node:http.createServer((req, res) => router(req, res))`. Bind `config.httpHost` + `config.httpPort` via `server.listen()`. On `listen` success, write the startup line `[mcp-server] price-monitor-mcp-server ready on http :<port>` to stderr (FR-013). On `listen` error (notably `EADDRINUSE`), write `[mcp-server] FATAL: failed to bind <host>:<port> — <code>` to stderr and `process.exit(1)` (FR-009).
- [x] T012 [US1] In the same file, instantiate `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` (stateless mode, research.md Decision 1) and call `server.connect(transport)` once at startup. The same transport instance handles every request via `transport.handleRequest(req, res, parsedBody)`.
- [x] T013 [US1] In the same file, implement the router: branch on `req.url` and `req.method`. For `POST /mcp`: collect the request body (no app-level size cap — rely on Node defaults to keep the surface minimal per FR-015), `JSON.parse` it, hand to `transport.handleRequest(req, res, parsed)`. On `JSON.parse` failure respond 400 with `Invalid JSON-RPC body`. Any unhandled error → 500 with `Internal Server Error`. For paths other than `/mcp` and `/health` → 404 with `Not Found`. For `POST /health` (or any non-`GET` on `/health`) → 405 with `Allow: GET` header and body `Method Not Allowed`. For `/mcp` with methods other than `POST` (e.g., `GET`), DO NOT pre-intercept — pass straight to `transport.handleRequest()` (Decision 7); the SDK returns the protocol-correct response for stateless mode.
- [x] T014 [US1] In the same file, implement the per-request 30 s timeout (FR-011a, Decision 5). On each `POST /mcp`: call `req.setTimeout(config.requestTimeoutMs)` and on the timeout event, if the response has not been sent, write a 504 with body `{"error":{"code":"request_timeout","message":"MCP request exceeded ${timeoutMs}ms timeout"}}` and end the response. Be defensive: if the SDK transport already responded, do nothing. **Test hook**: `config.ts` (T004) MUST also read an optional `MCP_REQUEST_TIMEOUT_MS` env var that, when set, overrides the 30_000 default; this is the hook T010(g) and T025 use to drive the timeout test in milliseconds rather than seconds. Document the env var inline as test-only — do not advertise it in the README.
- [x] T015 [US1] In the same file, implement the access-log line per FR-013a / data-model.md §3. Capture `requestStartedAt = Date.now()` at the top of each `POST /mcp` handler; on `res.on("finish", ...)`, write to stderr: `[mcp-server] http POST /mcp method=<jsonrpc-method> tool=<name|-> status=<code> ms=<duration>`. Derive `<jsonrpc-method>` from the parsed body (`-` if unparseable). Derive `<tool>` from `params.name` if `method === "tools/call"`, else `-`. Do NOT log `GET /health`. Do NOT log request body or arguments.
- [x] T016 [US1] Replace the stub in `runHttp` with the real implementation built across T011–T015. Confirm the dispatcher (`src/index.ts`) needs no further changes — it already calls `runHttp(server, config)`.
- [x] T017 [US1] Run `pnpm --filter @price-monitor/mcp-server test`. All cases authored in T010 must pass. Iterate on the implementation until they do.

**Checkpoint**: `MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start` boots a working server; `curl` smoke tests in `quickstart.md` §2 succeed; integration test suite green.

---

## Phase 4: User Story 2 — IDE-side stdio integration continues to work unchanged (Priority: P1)

**Goal**: Prove the dispatcher refactor did not regress stdio behavior. Same JSON-RPC frames on stdout, same startup line on stderr, no port bound.

**Independent Test**: Spawn the server with `MCP_TRANSPORT` unset, write a `tools/list` JSON-RPC frame to its stdin, read the JSON-RPC response from its stdout. Verify nothing else appeared on stdout (no log lines, no preamble), and verify the startup line appeared on stderr.

### Verification for User Story 2 ⚠️

- [x] T018 [P] [US2] Author `apps/mcp-server/tests/stdio-transport.test.ts` with these cases: (a) spawn with `MCP_TRANSPORT` unset, write `tools/list` JSON-RPC frame to stdin, parse the response from stdout, assert the five tool names, (b) assert that stdout received only valid JSON-RPC frames — no unparseable lines (this is the stdout-purity guard; FR-002, edge case "stdout pollution"), (c) assert stderr received the line `[mcp-server] price-monitor-mcp-server ready on stdio`, (d) assert no TCP listener was opened on `MCP_HTTP_PORT` (default 3001) by attempting a connect that should fail with ECONNREFUSED. Use the `spawnServer` helper from T003.

### Implementation for User Story 2

- [x] T019 [US2] No new code — the foundational refactor (T004–T009) already preserves stdio behavior. Run `pnpm --filter @price-monitor/mcp-server test` and confirm `tests/stdio-transport.test.ts` passes. If any case fails, fix the regression in `src/transports/stdio.ts` or `src/index.ts` (do not change `src/transports/http.ts` for this story).
- [x] T020 [US2] Manual MCP Inspector regression check: `npx @modelcontextprotocol/inspector pnpm --filter @price-monitor/mcp-server start`, click "List Tools", invoke `ping`, confirm `"pong"`. (Documented in `quickstart.md` §1.)

**Checkpoint**: Existing IDE/Inspector stdio workflows succeed unchanged.

---

## Phase 5: User Story 3 — Operators and orchestrators can health-check the HTTP MCP server (Priority: P2)

**Goal**: `GET /health` returns a small JSON document confirming the process is alive, suitable for orchestrator health probes.

**Independent Test**: With the server running in HTTP mode, `curl -s http://localhost:3001/health | jq` returns `{ status: "ok", uptime: <number>, version: "<pkg>", transport: "http" }`. With the server in stdio mode, the same curl fails to connect.

### Verification for User Story 3 ⚠️

- [x] T021 [US3] Add cases to `apps/mcp-server/tests/http-transport.test.ts` (under a separate `describe("GET /health")` block): (a) `GET /health` returns 200 with `Content-Type: application/json`, (b) JSON body has exactly the four documented fields with the right types and `transport === "http"`, (c) `uptime` is a positive number that grows between two consecutive probes, (d) measured round-trip latency on `localhost` is under 50 ms (SC-003), (e) the `/health` request did NOT produce an access-log line on stderr (FR-013a probe-spam exclusion).
- [x] T022 [US3] Add a case to `apps/mcp-server/tests/stdio-transport.test.ts`: spawn in stdio mode and assert that connecting to `MCP_HTTP_PORT` fails with `ECONNREFUSED` (no `/health` listener exists in stdio mode, FR-006).

### Implementation for User Story 3

- [x] T023 [US3] In `apps/mcp-server/src/transports/http.ts`, add the `GET /health` branch to the router. Build the response from data-model.md §2: `{ status: "ok", uptime: (Date.now() - startedAtMs) / 1000, version: config.version, transport: "http" }`. Capture `startedAtMs = Date.now()` once at server bootstrap. Respond `Content-Type: application/json; charset=utf-8`, `200`, `JSON.stringify(...)`. Skip the access-log emission for this branch.
- [x] T024 [US3] Run the suite. All US3 cases must pass without regressing US1 cases.

**Checkpoint**: Health-probe contract is live; orchestrator wiring (task 3.18 in the roadmap) has a concrete endpoint to point at.

---

## Phase 6: User Story 4 — Graceful shutdown on SIGTERM (Priority: P2)

**Goal**: On `SIGTERM` or `SIGINT`, stop accepting new connections, drain in-flight requests within 10 s, exit cleanly.

**Independent Test**: Start HTTP server, begin a slow `tools/call`, send `SIGTERM`. The slow call's response is delivered to its client; the process exits with code 0 within ~10 s; new requests arriving during shutdown receive `503` (or are refused at the TCP layer).

### Verification for User Story 4 ⚠️

- [x] T025 [US4] Add cases to `apps/mcp-server/tests/http-transport.test.ts` (under `describe("graceful shutdown")`). All cases spawn with `MCP_TEST_TOOLS=1` so the `slow_ping` tool from T005 is available.
  - (a) Start a `tools/call:slow_ping { ms: 500 }`, send `SIGTERM` after ~50 ms (while in-flight). Assert the in-flight request's response is delivered intact (`"slow pong"`) AND the child process exit code is 0 within ~1 s of the response.
  - (b) Send `SIGTERM` to a quiet server. Assert a stderr line matching `/shutting down \(signal=SIGTERM\)/` appears within 100 ms.
  - (c) Start a `slow_ping { ms: 1000 }`, send `SIGTERM`, then immediately fire a second `tools/call:ping` request. Assert the second request gets `503 Service Unavailable` (on a pre-existing keep-alive socket) OR `ECONNREFUSED` (fresh connection) — both are acceptable per the contract in `contracts/http-mcp.md`.
  - (d) Start a `slow_ping { ms: 15000 }` (exceeds the 10 s grace window). Send `SIGTERM`. Assert the process exits within ~10.5 s regardless. The in-flight client may receive an aborted-connection error — that is the documented behavior when grace elapses.
  - (e) **SIGINT path** (resolves analyze finding C4; FR-012): repeat case (a) using `SIGINT` instead of `SIGTERM`. Assert identical behavior (in-flight delivered, exit 0). Stderr line should match `/shutting down \(signal=SIGINT\)/`.

### Implementation for User Story 4

- [x] T026 [US4] In `apps/mcp-server/src/transports/http.ts`, register `process.on("SIGTERM", shutdown)` and `process.on("SIGINT", shutdown)` (FR-011, FR-012). The `shutdown` handler: write `[mcp-server] shutting down (signal=<sig>)` to stderr → set module-local `shuttingDown = true` → call `httpServer.close()` (stops accepting new connections) → schedule `setTimeout(() => process.exit(0), config.gracePeriodMs)` → when `httpServer.close`'s callback fires (all sockets idle), `clearTimeout` and `process.exit(0)` immediately.
- [x] T027 [US4] In the request handler, check `shuttingDown` at the top of each `POST /mcp` request — if true, respond 503 with body `Server shutting down` and end immediately (defensive against requests on pre-existing keep-alive connections).
- [x] T028 [US4] Run the suite. All US4 cases must pass without regressing US1 / US3 cases. If the 10 s drain test is flaky on slower CI, document the variance in the test comment but do not extend `gracePeriodMs` — the bound is the contract.

**Checkpoint**: Production deploys (task 3.18) can `docker stop` the MCP container without dropping in-flight chat tool calls.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, manual end-to-end verification, and final cleanup. None of these change runtime behavior.

- [x] T029 [P] Update `apps/mcp-server/README.md` with: (a) the two new env vars (`MCP_TRANSPORT`, `MCP_HTTP_PORT`) and their defaults, (b) the `MCP_TRANSPORT=http pnpm start` command, (c) a `curl` example for `/health` and a `curl` example for `POST /mcp tools/list`, (d) the MCP Inspector HTTP mode invocation (`npx @modelcontextprotocol/inspector` then point at `http://localhost:3001/mcp`), (e) the per-request timeout and graceful-shutdown grace window values for operator awareness. Source content from `quickstart.md`.
- [x] T030 [P] Manual end-to-end smoke test: run the full `quickstart.md` §1 (stdio) and §2 (HTTP) flows by hand. Confirm every step in the docs actually produces the documented output. Fix any drift between docs and reality. Do NOT commit any speculative web-side wiring (task 3.10 owns that).
- [x] T031 Run `pnpm lint` from repo root and address any Biome findings in the new files (`apps/mcp-server/src/config.ts`, `src/server.ts`, `src/transports/{stdio,http}.ts`, `tests/**`). Do not auto-fix unrelated existing findings.
- [x] T032 Run the full integration suite one final time: `pnpm --filter @price-monitor/mcp-server test`. Capture the count and pass/fail status in the PR description. All four user stories' cases must be green.
- [x] T033 Final review pass: re-read `spec.md` Functional Requirements (FR-001 through FR-015 and NFR-001 through NFR-004); for each, confirm the corresponding test or implementation exists. Note any deferred items in the PR description (none expected; this is a sanity check, not a fix-it task).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 (needs `vitest` to run T009's eventual sanity check, though T004–T008 can technically begin alongside T001–T003). BLOCKS all user stories.
- **Phase 3 (US1)**: Depends on Phase 2. The MVP — must land before US3 and US4 because both add code to `src/transports/http.ts`.
- **Phase 4 (US2)**: Depends on Phase 2 only. Can run in parallel with Phase 3 (different test file, no implementation work — T019 is just running the existing tests).
- **Phase 5 (US3)**: Depends on Phase 3 (adds `GET /health` to the same `http.ts` file).
- **Phase 6 (US4)**: Depends on Phase 3 (adds signal handling to the same `http.ts` file). Can run in parallel with Phase 5 if two developers are willing to coordinate edits to `http.ts`; otherwise sequence US3 → US4.
- **Phase 7 (Polish)**: Depends on all four user stories.

### Within Each User Story

- Verification task (test file or new test cases) is authored first so failing tests pin the contract.
- Implementation tasks land in the order listed (T011 → T015 for US1) because they all touch `src/transports/http.ts`.
- Each story's checkpoint must pass before the next story begins.

### Parallel Opportunities

- Phase 1: T002 and T003 are different files — `[P]`.
- Phase 2: T004, T005, T006, T007 are all different files — `[P]` candidates, but they're small and the dispatcher (T008) needs them all, so a sequential pass is just as fast.
- Phase 3 ↔ Phase 4 can run truly in parallel: US1 only touches `tests/http-transport.test.ts` and `src/transports/http.ts`; US2 only touches `tests/stdio-transport.test.ts`.
- Phase 5 (US3) and Phase 6 (US4) both touch `src/transports/http.ts` — sequential is recommended.
- Polish tasks T029, T030 are different files / different activities — `[P]`.

---

## Parallel Example: Foundational Phase

```bash
# Different files — run in any order, including in parallel by separate developers:
Task T004: Create src/config.ts (env parsing)
Task T005: Create src/server.ts (tool registration extract)
Task T006: Create src/transports/stdio.ts (lift current behavior)
Task T007: Create src/transports/http.ts stub
# Then sequentially:
Task T008: Rewrite src/index.ts dispatcher (depends on T004–T007)
Task T009: Manual sanity check (depends on T008)
```

## Parallel Example: US1 + US2 simultaneously

```bash
# Developer A drives US1:
Task T010: Author http-transport.test.ts with US1 cases
Task T011–T016: Implement runHttp in src/transports/http.ts
Task T017: Run suite, iterate to green

# Developer B drives US2 (no implementation work — proves no regression):
Task T018: Author stdio-transport.test.ts
Task T019: Run suite, fix any regression in src/transports/stdio.ts
Task T020: Manual MCP Inspector smoke test
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2 Foundational → 3 US1.
2. **STOP and validate**: HTTP transport works end-to-end via `curl` + integration test. Web-app wiring (task 3.10 in the roadmap) can begin against this immediately even before US3/US4 land.

### Incremental Delivery

1. Setup + Foundational → IDE/stdio still works, dispatcher in place.
2. Add US1 → web app can talk to MCP over HTTP (MVP).
3. Add US2 verification → regression-test net for stdio.
4. Add US3 → orchestrator health probes work; Coolify wiring (task 3.18) unblocked.
5. Add US4 → deploys are graceful.
6. Polish → docs + final lint + manual smoke.

### Parallel Team Strategy

1. Whole team completes Setup + Foundational together (small, fast, blocks everything).
2. Once Foundational is green:
   - Developer A: US1 (the meat of the work).
   - Developer B: US2 (mostly test authoring + manual Inspector check).
3. After US1 lands:
   - Developer A or C: US3.
   - Developer B (after US2): US4.
4. Whoever finishes first picks up Polish.

---

## Notes

- All file paths above are relative to repo root; the absolute prefix is `/home/onlineeric/repos/price-monitoring-agent/`.
- The whole feature stays inside `apps/mcp-server/`. No edits to `apps/web/`, `apps/worker/`, or `packages/db/` are part of this spec.
- Stdio behavior MUST remain byte-identical on stdout (all logs to stderr) — this is the regression-net the entire IDE workflow rests on.
- `node:http` is intentional (FR-015) — do not pull in Express / Fastify / Hono.
- `StreamableHTTPServerTransport` runs in stateless mode (`sessionIdGenerator: undefined`) per research.md Decision 1.
- Per-request timeout, grace window, and the 0.0.0.0 bind are constants in `src/config.ts` — no env var override.
- Tests are live child-process integration tests (no SDK mocks) per research.md Decision 10.
- Commit after each task or each user-story checkpoint; PR title `feat(mcp-server): HTTP transport mode (006)`.
