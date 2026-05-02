# @price-monitor/mcp-server

MCP (Model Context Protocol) server that exposes price-monitor tools to AI agents over **stdio**.

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
```

## Testing with MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a browser-based UI for interacting with MCP servers. Use it to verify tools work correctly without needing an AI client.

```bash
npx @modelcontextprotocol/inspector apps/mcp-server/node_modules/.bin/tsx apps/mcp-server/src/index.ts
```

This opens a web UI (default `http://localhost:6274`) where you can:

1. See all registered tools (e.g. `ping`)
2. Call any tool with custom arguments
3. Inspect the JSON-RPC request/response payloads

### Verifying the `ping` tool

1. Start the Inspector with the command above
2. Open the browser UI
3. Navigate to **Tools** and click **ping**
4. Click **Run** — you should see `"pong"` in the response

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

## Architecture Notes

- **Transport:** stdio (stdin/stdout for JSON-RPC, stderr for logging)
- **Logging:** All log output uses `console.error()` — `console.log()` is reserved for the JSON-RPC protocol stream and must never be used for logging
- **SDK:** `@modelcontextprotocol/sdk` with Zod for input validation
