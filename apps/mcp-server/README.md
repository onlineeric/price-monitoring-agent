# @price-monitor/mcp-server

MCP (Model Context Protocol) server that exposes price-monitor tools to AI agents. Supports two transports: **stdio** (the original IDE / inspector path) and **HTTP** (used in production so the web app and the MCP server can run as independent containers).

The active transport is selected at startup from `MCP_TRANSPORT`; defaults to `stdio` so existing IDE configurations keep working with no edits.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http`. Any other value fails fast on startup. |
| `MCP_HTTP_PORT` | `3002` | Port for HTTP mode. Listener binds `0.0.0.0`. Ignored in stdio mode. Chosen as `3002` (not `3001`) so it does not collide with the worker's health server on the host. |
| `DATABASE_URL` | (required) | Postgres connection string (used by the real tools). |
| `REDIS_URL` | (required) | Redis connection string (used by `add_product`). |

The HTTP transport additionally enforces a **30 second per-request timeout** and a **10 second graceful-shutdown grace window** on `SIGTERM` / `SIGINT`. Both values are constants — operators tuning these should change the source, not the env.

## Scripts

From the **repo root**:

```bash
pnpm mcp:dev    # Start the server in watch mode (auto-restarts on file changes)
pnpm mcp:build  # Type-check the project (tsc --noEmit)
```

From `apps/mcp-server/`:

```bash
pnpm dev        # Same as mcp:dev
pnpm start      # Run the server once (no watch)
pnpm build      # Same as mcp:build
pnpm test       # Run the integration test suite (Vitest, child-process)
```

## Running in stdio mode (default)

```bash
pnpm --filter @price-monitor/mcp-server start
```

You should see one stderr line:

```
[mcp-server] price-monitor-mcp-server ready on stdio
```

The process waits on stdin for JSON-RPC frames and exits when stdin closes. **stdout is reserved for JSON-RPC frames** — every log line goes to stderr (a single `console.log` would corrupt the protocol stream).

## Running in HTTP mode

```bash
MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start
```

You should see one stderr line:

```
[mcp-server] price-monitor-mcp-server ready on http :3002
```

### Smoke test the health endpoint

The server answers on **both** `GET /health` (used by orchestrator probes
like Coolify) and `GET /mcp/health` (used by the web app, which composes
its probe URL by appending `/health` to the documented `MCP_HTTP_URL`).
Both return the same body.

```bash
curl -s http://localhost:3002/health | jq
# {
#   "status": "ok",
#   "uptime": 4.218,
#   "version": "1.0.0",
#   "transport": "http"
# }

curl -s http://localhost:3002/mcp/health | jq
# (identical response)
```

### Smoke test the MCP endpoint

`tools/list`:

```bash
curl -s -X POST http://localhost:3002/mcp \
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

`tools/call` for `ping`:

```bash
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"count":3}}}' \
  | jq '.result.content[0].text'
# "pong pong pong"
```

Each `POST /mcp` produces one stderr access-log line (HTTP method, JSON-RPC method, tool name if any, status, duration). `GET /health` is intentionally NOT logged so orchestrator probes do not flood the log stream.

### Override the port

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=4321 pnpm --filter @price-monitor/mcp-server start
```

## Testing with MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a browser-based UI for interacting with MCP servers.

### stdio mode

```bash
npx @modelcontextprotocol/inspector pnpm --filter @price-monitor/mcp-server start
```

This opens a web UI (default `http://localhost:6274`) where you can list tools and call any of them.

### HTTP mode

Start the server in HTTP mode in one shell:

```bash
MCP_TRANSPORT=http pnpm --filter @price-monitor/mcp-server start
```

In another, launch Inspector and point its **Streamable HTTP** transport at `http://localhost:3002/mcp`.

## IDE Integration (VSCode / Cursor)

To register this server in your IDE, add the following to your MCP config (`.vscode/mcp.json` or Cursor equivalent):

```json
{
  "servers": {
    "price-monitor": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["--filter", "@price-monitor/mcp-server", "start"]
    }
  }
}
```

`MCP_TRANSPORT` is unset, so the server picks stdio — no edit needed for an existing IDE setup.

## Architecture Notes

- **Dispatcher** (`src/index.ts`): reads `MCP_TRANSPORT`, builds the McpServer, hands off to one of the two transports.
- **Stdio transport** (`src/transports/stdio.ts`): connects the MCP server to `StdioServerTransport`. stdout = JSON-RPC; stderr = logs.
- **HTTP transport** (`src/transports/http.ts`): bare `node:http` server (no framework — three endpoints would not justify the dependency cost). `POST /mcp` is delegated per-request to a fresh `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` (stateless mode — the SDK requires fresh per-request transports in this mode). `GET /health` and `GET /mcp/health` are server-owned (the second so the web app can reuse `MCP_HTTP_URL` as a base by appending `/health`). `SIGTERM` / `SIGINT` triggers a 10 s graceful drain.
- **Tool registry** (`src/server.ts`): the same five tools (`search_products`, `get_product_history`, `get_price_summary`, `add_product`, `ping`) are registered for both transports. The transport choice is purely a wire-protocol concern.
- **Logging**: `console.error` in both modes; the rule is "stderr only" everywhere so a future refactor cannot accidentally re-introduce stdout pollution in stdio mode.
- **SDK**: `@modelcontextprotocol/sdk` with Zod for input validation.
