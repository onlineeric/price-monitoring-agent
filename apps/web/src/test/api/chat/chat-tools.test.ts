import { beforeEach, describe, expect, it, vi } from "vitest";

const { callToolMock, listMcpToolsMock } = vi.hoisted(() => ({
  callToolMock: vi.fn(),
  listMcpToolsMock: vi.fn(),
}));

vi.mock("@/lib/mcp", () => ({
  getMcpClient: vi.fn(async () => ({ callTool: callToolMock })),
  listMcpTools: listMcpToolsMock,
}));

import { createChatLogger } from "@/lib/ai/chat-logger";
import { buildMcpTools, jsonSchemaToZod } from "@/lib/ai/chat-tools";

function makeLogger() {
  const spies = {
    turnReceived: vi.fn(),
    toolCallStart: vi.fn(),
    toolCallEnd: vi.fn(),
    providerError: vi.fn(),
    validationRejected: vi.fn(),
    budgetExceeded: vi.fn(),
    turnTimeout: vi.fn(),
    emptyResponse: vi.fn(),
    mcpToolListEmpty: vi.fn(),
    turnAborted: vi.fn(),
    turnFinished: vi.fn(),
    warn: vi.fn(),
  };
  return spies;
}

beforeEach(() => {
  callToolMock.mockReset();
  listMcpToolsMock.mockReset();
});

describe("jsonSchemaToZod", () => {
  it("maps a simple object with string and number fields", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        q: { type: "string" },
        limit: { type: "number" },
      },
      required: ["q"],
    });
    expect(schema.safeParse({ q: "hello", limit: 5 }).success).toBe(true);
    // `limit` is optional
    expect(schema.safeParse({ q: "hello" }).success).toBe(true);
    // `q` missing → required field error
    expect(schema.safeParse({ limit: 5 }).success).toBe(false);
  });

  it("accepts passthrough fields so MCP additions are forward-compatible", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    const parsed = schema.safeParse({ q: "hi", extra: "anything" });
    expect(parsed.success).toBe(true);
  });
});

describe("buildMcpTools", () => {
  it("builds an AI SDK tool per MCP tool with a working execute()", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "search_products",
        description: "Full-text search across products",
        inputSchema: {
          type: "object",
          properties: { q: { type: "string" } },
          required: ["q"],
        },
      },
    ]);

    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: '{"rows":[{"id":1}]}' }],
    });

    const tools = await buildMcpTools({ logger: makeLogger() });
    expect(Object.keys(tools)).toEqual(["search_products"]);
    const t = tools.search_products as unknown as {
      description?: string;
      execute: (args: unknown, options: { toolCallId: string }) => Promise<unknown>;
    };
    expect(t.description).toBe("Full-text search across products");

    const result = await t.execute({ q: "monitor" }, { toolCallId: "call-1" } as unknown as { toolCallId: string });
    expect(result).toEqual({
      content: [{ type: "text", text: '{"rows":[{"id":1}]}' }],
    });
    expect(callToolMock).toHaveBeenCalledWith({
      name: "search_products",
      arguments: { q: "monitor" },
    });
  });

  it("passes tool results through untruncated (FR-004)", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "get_price_history",
        description: "price history",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ]);

    const hugePayload = "x".repeat(50_000);
    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: hugePayload }],
      structuredContent: { rows: [{ price: 1234 }] },
    });

    const tools = await buildMcpTools({ logger: makeLogger() });
    const executed = await (
      tools.get_price_history as unknown as {
        execute: (a: unknown, o: { toolCallId: string }) => Promise<unknown>;
      }
    ).execute({}, { toolCallId: "c2" });

    expect(executed).toEqual({
      content: [{ type: "text", text: hugePayload }],
      structuredContent: { rows: [{ price: 1234 }] },
    });
  });

  it("falls back to passthrough when inputSchema conversion fails and logs a warning", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "weird_tool",
        description: "intentionally broken schema",
        // Not a valid JSON-Schema object; `jsonSchemaToZod` still must not throw.
        // We simulate a schema-generation failure by spying and forcing an
        // internal error path in the test.
        inputSchema: null as unknown as {
          type: "object";
          properties?: Record<string, unknown>;
          required?: string[];
        },
      },
    ]);
    callToolMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    const logger = makeLogger();
    const tools = await buildMcpTools({ logger });
    expect(tools.weird_tool).toBeTruthy();
    expect(logger.warn).toHaveBeenCalled();

    // Executes with arbitrary args via the passthrough fallback.
    const executed = await (
      tools.weird_tool as unknown as {
        execute: (a: unknown, o: { toolCallId: string }) => Promise<unknown>;
      }
    ).execute({ anything: 1 }, { toolCallId: "c3" });
    expect(executed).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("returns a Phase 2.6 error envelope when callTool rejects (FR-009)", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "search_products",
        description: "desc",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ]);
    callToolMock.mockRejectedValue(new Error("boom while calling tool"));

    const logger = makeLogger();
    const tools = await buildMcpTools({ logger });
    const executed = (await (
      tools.search_products as unknown as {
        execute: (a: unknown, o: { toolCallId: string }) => Promise<unknown>;
      }
    ).execute({}, { toolCallId: "c4" })) as {
      isError: boolean;
      content: Array<{ type: string; text: string }>;
    };

    expect(executed.isError).toBe(true);
    const parsed = JSON.parse(executed.content[0].text) as {
      error: { code: string; message: string };
    };
    expect(parsed.error.code).toBe("INTERNAL_ERROR");
    expect(parsed.error.message).toContain("boom while calling tool");
    expect(logger.toolCallEnd).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error" }));
  });

  it("returns an empty tool map and logs a warning when MCP publishes zero tools", async () => {
    listMcpToolsMock.mockResolvedValue([]);
    const logger = makeLogger();
    const tools = await buildMcpTools({ logger });
    expect(tools).toEqual({});
    expect(logger.mcpToolListEmpty).toHaveBeenCalled();
  });
});

// Sanity check that createChatLogger emits the expected prefix shape.
describe("createChatLogger", () => {
  it("prefixes log lines with [chat] and includes turnId/conversationId", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createChatLogger({ turnId: "T1", conversationId: "C1" });
    logger.turnReceived({ messageCount: 3, provider: "openai", model: "gpt-4o-mini" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = (logSpy.mock.calls[0]?.[0] ?? "") as string;
    expect(line).toContain("[chat]");
    expect(line).toContain("turn_received");
    expect(line).toContain('turnId="T1"');
    expect(line).toContain('conversationId="C1"');
    logSpy.mockRestore();
  });
});
