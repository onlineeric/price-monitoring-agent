import { setTimeout as delay } from "node:timers/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerAddProduct } from "./tools/add-product.js";
import { registerGetPriceSummary } from "./tools/get-price-summary.js";
import { registerGetProductHistory } from "./tools/get-product-history.js";
import { registerSearchProducts } from "./tools/search-products.js";
import { ToolError, withErrorHandling } from "./tools/_wrap.js";

/**
 * Construct the MCP server with the canonical tool set. Both transports
 * (stdio and http) call this so FR-007 — "the same tool registry is exposed
 * through both transports" — is enforced by construction rather than by
 * convention.
 *
 * Test-only hook: when `MCP_TEST_TOOLS=1`, an extra `slow_ping` tool is
 * registered. It exists solely to drive the per-request-timeout test
 * (`tests/http-transport.test.ts` case g) and the graceful-shutdown drain
 * tests without coupling them to live DB / Redis state. Production never
 * sets this var, so the tool is invisible to chat traffic.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "price-monitor-mcp-server",
    version: "0.1.0",
  });

  // --- Real tools (stable across both transports) ---
  registerSearchProducts(server);
  registerGetProductHistory(server);
  registerGetPriceSummary(server);
  registerAddProduct(server);

  // --- Dev/debug tool ---
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check tool — returns 'pong'.",
      inputSchema: z.object({
        count: z.number().int().min(1).optional(),
      }),
    },
    withErrorHandling("ping", async ({ count }) => {
      const parsedCount = Number(count);
      const safeCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;

      return {
        content: [{ type: "text", text: "pong ".repeat(safeCount).trim() }],
      };
    }),
  );

  // Test-only: see the function-level comment above.
  if (process.env.MCP_TEST_TOOLS === "1") {
    server.registerTool(
      "slow_ping",
      {
        title: "Slow Ping",
        description:
          "Test-only: sleeps for `ms` milliseconds before returning 'slow pong'. Registered only when MCP_TEST_TOOLS=1.",
        inputSchema: z.object({
          ms: z.number().int().min(0).max(60_000),
        }),
      },
      withErrorHandling("slow_ping", async ({ ms }) => {
        await delay(ms);
        return {
          content: [{ type: "text", text: "slow pong" }],
        };
      }),
    );

    // Throws a ToolError so the integration suite can prove the
    // `_wrap.ts` envelope round-trips through the HTTP transport
    // unchanged (FR-008 / T010 case n). This is the only way to
    // exercise the wrapper end-to-end without standing up failure
    // conditions in real DB/Redis state.
    server.registerTool(
      "throw_test",
      {
        title: "Throw Test",
        description:
          "Test-only: always throws a ToolError. Registered only when MCP_TEST_TOOLS=1.",
        inputSchema: z.object({}),
      },
      withErrorHandling("throw_test", async () => {
        throw new ToolError("TEST_ERROR", "intentional failure for wrapper round-trip");
      }),
    );
  }

  return server;
}
