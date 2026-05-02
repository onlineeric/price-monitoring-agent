import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export class ToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export function withErrorHandling<Args>(
  toolName: string,
  handler: (args: Args) => Promise<CallToolResult>,
) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      const code = err instanceof ToolError ? err.code : "INTERNAL_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      // stderr only — stdout is reserved for JSON-RPC frames on stdio transport.
      console.error(`[mcp-server] tool '${toolName}' failed:`, err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: { code, message } }, null, 2),
          },
        ],
      };
    }
  };
}
