import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "@price-monitor/db";

const server = new McpServer({
  name: "price-monitor-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Health check tool — returns 'pong'.",
    inputSchema: z.object({
      count: z.number().int().min(1).optional(),
    }),
  },
  async ({ count }) => {
    const parsedCount = Number(count);
    const safeCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;

    return {
      content: [{ type: "text", text: "pong ".repeat(safeCount).trim() }],
    };
  },
);

// stdio transport: stdout is reserved for JSON-RPC frames. Any logging must go
// to stderr (console.error) — console.log would corrupt the protocol stream.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-server] price-monitor-mcp-server ready on stdio");  // normal logging
