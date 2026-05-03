# Quickstart: MCP Server HTTP Transport Mode

**Feature**: 006-mcp-http-transport
**Audience**: Developers running the MCP server locally during this feature's
implementation and review.

This is a "pre-deploy" quickstart. The Dockerfile, docker-compose entry,
and Coolify wiring land in tasks 3.11–3.18 (separate spec). For now you
run the MCP server directly from `apps/mcp-server/`.

## Prerequisites

- Repo cloned, `pnpm install` completed at the root.
- PostgreSQL + Redis running locally (`pnpm docker:up` from the repo root).
- `.env.local` (or shell env) with `DATABASE_URL` and `REDIS_URL` pointing
  at the local Docker services.

## 1. Run in stdio mode (default — preserved behavior)

```bash
pnpm --filter @price-monitor/mcp-server start
```

What you should see:

- One stderr line: `[mcp-server] price-monitor-mcp-server ready on stdio`.
- The process waits on stdin for JSON-RPC frames.
- Exit when stdin closes (Ctrl+D in a tty, or when the parent process
  closes the pipe).

Verify with the MCP Inspector (stdio mode):

```bash
npx @modelcontextprotocol/inspector pnpm --filter @price-monitor/mcp-server start
```

Open the inspector UI, click "List Tools", invoke `ping` — should return
`"pong"`.

## 2. Run in HTTP mode (new)

```bash
MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start
```

What you should see:

- One stderr line: `[mcp-server] price-monitor-mcp-server ready on http :3001`.
- The process binds to `0.0.0.0:3001` and stays up.

Smoke test the health endpoint:

```bash
curl -s http://localhost:3001/health | jq
# {
#   "status": "ok",
#   "uptime": 4.218,
#   "version": "1.0.0",
#   "transport": "http"
# }
```

Smoke test the MCP endpoint with a `tools/list` request:

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | jq '.result.tools[].name'
# "search_products"
# "get_product_history"
# "get_price_summary"
# "add_product"
# "ping"
```

Smoke test a `tools/call` for `ping`:

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"count":3}}}' \
  | jq '.result.content[0].text'
# "pong pong pong"
```

You should also see one stderr access-log line per `POST /mcp` request,
e.g.:

```
[mcp-server] http POST /mcp method=tools/list tool=- status=200 ms=4
[mcp-server] http POST /mcp method=tools/call tool=ping status=200 ms=2
```

`GET /health` lines are intentionally NOT logged.

## 3. Override the port

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=4321 pnpm --filter @price-monitor/mcp-server start
```

`curl http://localhost:4321/health` should now succeed; `:3001` will
fail to connect.

## 4. Verify edge-case behavior

### Misconfigured transport

```bash
MCP_TRANSPORT=foo pnpm --filter @price-monitor/mcp-server start
# stderr: [mcp-server] FATAL: invalid MCP_TRANSPORT="foo" (expected "stdio" or "http")
# process exits with code 1
```

### Port already in use

```bash
# In one shell: hold port 3001
nc -l 3001 &

# In another shell:
MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start
# stderr: [mcp-server] FATAL: failed to bind 0.0.0.0:3001 — EADDRINUSE
# process exits with non-zero code within 2 seconds
```

### Graceful shutdown

```bash
MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start &
sleep 1
# Send a long request in the background (use a tool that does real work,
# e.g., search_products against a populated DB):
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"monitor"}}}' &

# Immediately send SIGTERM:
kill -TERM %1

# Expected: the curl command above prints a complete JSON-RPC response,
# then the MCP process exits with code 0 within ~10 seconds.
```

### Per-request timeout

The 30-second per-request timeout is hard to trigger by hand — the test
suite exercises it via a stub tool that sleeps. If you want to observe
the behavior, the integration test `tests/http-transport.test.ts`
(case "per-request timeout") demonstrates it.

## 5. Run the integration test suite

```bash
pnpm --filter @price-monitor/mcp-server test
```

This runs the four integration test files added by this feature
(`tests/http-transport.test.ts` and `tests/stdio-transport.test.ts`).
They each spawn the MCP server in a real child process — no mocks of
the SDK transports — so a green run is strong evidence that the wire
behavior matches the contracts above.

## 6. Verify the IDE workflow has not regressed

Open VSCode or Cursor with your existing MCP configuration pointing at
`pnpm --filter @price-monitor/mcp-server start` (no env var set, so
stdio remains the default). The IDE should list and invoke tools exactly
as before this feature.

If you previously configured a different IDE entry point, no edit is
needed — the default-transport behavior is unchanged.

## 7. Wire the web app to HTTP mode (preview only)

Task 3.10 (separate spec) will modify `apps/web/src/lib/mcp/client.ts` to
prefer `StreamableHTTPClientTransport` when `MCP_HTTP_URL` is set. To
preview that path manually before 3.10 lands, you can hand-edit the web
client locally — but do not commit that change as part of this spec.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE` at startup | Another process is on `MCP_HTTP_PORT` | `lsof -i :3001` to find it; kill it or pick a different port via `MCP_HTTP_PORT=...` |
| `[mcp-server] FATAL: invalid MCP_TRANSPORT=...` | Typo in env var | Use exactly `stdio` or `http` |
| MCP Inspector shows zero tools in HTTP mode | Inspector pointed at wrong URL | Inspector HTTP mode expects the `/mcp` endpoint URL: `http://localhost:3001/mcp` |
| Stdio mode prints garbage to terminal | Something writing to stdout in stdio mode | All logs MUST go to stderr in stdio mode (FR-002); check your local edits |
| `curl /health` hangs in stdio mode | No HTTP listener exists in stdio mode (by design, FR-002) | Switch to HTTP mode with `MCP_TRANSPORT=http` |

## Cross-Reference

- Wire contracts: `contracts/http-mcp.md`, `contracts/http-health.md`
- Decisions log: `research.md`
- Spec: `spec.md`
