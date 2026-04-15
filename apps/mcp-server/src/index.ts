import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "price-monitor-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Health check tool — returns 'pong'.",
  },
  async () => ({
    content: [{ type: "text", text: "pong" }],
  }),
);

// stdio transport: stdout is reserved for JSON-RPC frames. Any logging must go
// to stderr (console.error) — console.log would corrupt the protocol stream.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] price-monitor-mcp-server ready on stdio");  // normal logging
