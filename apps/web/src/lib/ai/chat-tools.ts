/**
 * Bridge MCP tools (published by the Phase 3.2 singleton client) into AI SDK
 * v6 `tool()` instances that `streamText` can invoke mid-stream.
 *
 * Responsibilities:
 *   - Convert each MCP tool's JSON-Schema `inputSchema` into a Zod schema so
 *     the AI SDK can validate the provider's tool-call args. When conversion
 *     fails we fall back to `z.object({}).passthrough()` and log a warning —
 *     one misbehaving tool should not block the whole chat route (research
 *     Decision 2).
 *   - Wrap each tool's `execute` function so it calls the live MCP client.
 *     Tool-level RPC failures are returned as the Phase 2.6
 *     `{ error: { code, message } }` envelope so the model can recover
 *     (FR-009). Connection-level failures bubble up.
 *   - Emit `tool_call_start` / `tool_call_end` log lines via the per-turn
 *     logger so FR-012 is satisfied.
 *
 * When the MCP server publishes zero tools we return an empty tool map and
 * log a warning; the turn still serves as text-only chat (spec edge case).
 */

import { tool, type Tool } from "ai";
import { z } from "zod";

import { getMcpClient, listMcpTools } from "@/lib/mcp";

import type { ChatLogger } from "./chat-logger";
import { scrubMessage } from "./chat-errors";

type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [x: string]: unknown;
};

type McpTool = Awaited<ReturnType<typeof listMcpTools>>[number];

/**
 * Convert an MCP JSON-Schema `inputSchema` (always `type: "object"`) into a
 * Zod schema. Only handles the primitive leaf types we actually see from the
 * MCP server today; any shape we do not understand is accepted via
 * `z.unknown()` so the tool call still reaches the MCP server, and the
 * server's own Zod schema rejects it if invalid.
 */
export function jsonSchemaToZod(schema: JsonSchemaObject): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [key, rawProp] of Object.entries(properties)) {
    const prop = (rawProp ?? {}) as Record<string, unknown>;
    let field: z.ZodTypeAny;

    const propType = prop.type as string | string[] | undefined;
    const firstType = Array.isArray(propType) ? propType[0] : propType;

    switch (firstType) {
      case "string":
        field = z.string();
        break;
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.unknown());
        break;
      case "object":
        field = z.record(z.unknown());
        break;
      default:
        field = z.unknown();
        break;
    }

    if (typeof prop.description === "string" && prop.description.length > 0) {
      field = field.describe(prop.description);
    }

    if (!required.has(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape).passthrough();
}

function fallbackSchema(): z.ZodTypeAny {
  return z.object({}).passthrough();
}

export type BuildMcpToolsOptions = {
  logger: ChatLogger;
};

/**
 * Lists the MCP tools once and returns the AI SDK tool map. Throws when the
 * MCP client cannot be reached (this is the `mcp_unreachable` path the route
 * turns into a pre-stream 502). Individual tool-call failures at execution
 * time do NOT throw — they return a Phase 2.6 error envelope instead.
 */
export async function buildMcpTools(
  options: BuildMcpToolsOptions,
): Promise<Record<string, Tool>> {
  const { logger } = options;
  const mcpTools = await listMcpTools();

  if (mcpTools.length === 0) {
    logger.mcpToolListEmpty();
    return {};
  }

  const entries: Array<[string, Tool]> = [];

  for (const mcpTool of mcpTools) {
    entries.push([mcpTool.name, bridgeMcpTool(mcpTool, logger)]);
  }

  return Object.fromEntries(entries);
}

function bridgeMcpTool(mcpTool: McpTool, logger: ChatLogger): Tool {
  let parameters: z.ZodTypeAny;
  const rawSchema = mcpTool.inputSchema;
  try {
    if (
      !rawSchema ||
      typeof rawSchema !== "object" ||
      (rawSchema as JsonSchemaObject).type !== "object"
    ) {
      throw new Error("inputSchema must be a JSON-Schema object");
    }
    parameters = jsonSchemaToZod(rawSchema as JsonSchemaObject);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("mcp_schema_conversion_failed", {
      toolName: mcpTool.name,
      message,
    });
    parameters = fallbackSchema();
  }

  return tool({
    description: mcpTool.description ?? mcpTool.name,
    inputSchema: parameters,
    async execute(args, { toolCallId }) {
      const started = Date.now();
      logger.toolCallStart({ toolName: mcpTool.name, toolCallId });

      try {
        const client = await getMcpClient();
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: (args ?? {}) as Record<string, unknown>,
        });
        const isError = (result as { isError?: boolean }).isError === true;
        logger.toolCallEnd({
          toolName: mcpTool.name,
          toolCallId,
          durationMs: Date.now() - started,
          outcome: isError ? "error" : "success",
          errorCode: isError ? "tool_error" : undefined,
        });
        // FR-004: pass the raw MCP result through untruncated. MCP tools are
        // responsible for self-limiting via their own input schemas.
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.toolCallEnd({
          toolName: mcpTool.name,
          toolCallId,
          durationMs: Date.now() - started,
          outcome: "error",
          errorCode: "INTERNAL_ERROR",
        });
        // FR-009: return a Phase 2.6 envelope so the model can see the failure
        // and recover, rather than rethrowing and tearing down the turn.
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: { code: "INTERNAL_ERROR", message: scrubMessage(message) },
              }),
            },
          ],
        };
      }
    },
  });
}
