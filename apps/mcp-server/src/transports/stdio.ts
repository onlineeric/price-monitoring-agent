import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerConfig } from "../config.js";

/**
 * Connect the MCP server to the stdio transport.
 *
 * stdout is reserved for JSON-RPC frames — every log MUST go to stderr
 * (FR-002). The current behavior is a verbatim lift from the pre-006
 * `src/index.ts`; this file exists so a future refactor cannot accidentally
 * route a startup log to stdout in a way that would corrupt the protocol
 * stream (edge case "stdout pollution").
 */
export async function runStdio(server: McpServer, _config: ServerConfig): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-server] price-monitor-mcp-server ready on stdio");
}
