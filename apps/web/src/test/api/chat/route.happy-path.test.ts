import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callToolMock, listMcpToolsMock, streamTextMock } = vi.hoisted(() => ({
  callToolMock: vi.fn(),
  listMcpToolsMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock("@/lib/mcp", () => ({
  getMcpClient: vi.fn(async () => ({ callTool: callToolMock })),
  listMcpTools: listMcpToolsMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: (modelId: string) => ({ modelId }),
}));
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (modelId: string) => ({ modelId }),
}));
vi.mock("@ai-sdk/google", () => ({
  google: (modelId: string) => ({ modelId }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, streamText: streamTextMock };
});

// NOTE: importing the route must happen AFTER vi.mock calls above.
// The mock for "ai" keeps the real `createUIMessageStream` /
// `createUIMessageStreamResponse` / `stepCountIs` / `convertToModelMessages`
// implementations so the route's real streaming path is exercised.

import { POST } from "@/app/api/chat/route";

/**
 * Produce a synthetic `StreamTextResult`-like object with just the methods the
 * route touches: `toUIMessageStream()` (returns a ReadableStream of chunks)
 * and `finishReason` (PromiseLike<FinishReason>). We also invoke the route's
 * registered callbacks synchronously so `sawTextDelta`/`sawToolCall` flags
 * track reality.
 */
function fakeStreamResult(options: {
  chunks: Array<Record<string, unknown>>;
  finishReason?: "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other";
  onCall: (args: {
    onChunk?: (event: { chunk: Record<string, unknown> }) => void;
    onFinish?: (event: { finishReason: string }) => void;
    onError?: (event: { error: unknown }) => void;
    onAbort?: () => void;
  }) => void;
}) {
  const { chunks, finishReason = "stop", onCall } = options;
  streamTextMock.mockImplementationOnce((opts: Record<string, unknown>) => {
    onCall(opts as never);
    // Invoke onChunk for each text/tool-call chunk so the route's book-keeping fires.
    const onChunk = opts.onChunk as
      | ((event: { chunk: Record<string, unknown> }) => void)
      | undefined;
    if (onChunk) {
      for (const chunk of chunks) onChunk({ chunk });
    }

    const stream = new ReadableStream<Record<string, unknown>>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    const onFinish = opts.onFinish as
      | ((event: { finishReason: string }) => void)
      | undefined;

    // Defer the onFinish callback until the next tick so the route reads the
    // stream before finish.
    queueMicrotask(() => {
      if (onFinish) onFinish({ finishReason });
    });

    return {
      toUIMessageStream: () => stream,
      finishReason: Promise.resolve(finishReason),
    };
  });
}

async function readChunks(
  response: Response,
): Promise<Array<{ type: string; [k: string]: unknown }>> {
  if (!response.body) throw new Error("response.body missing");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Array<{ type: string; [k: string]: unknown }> = [];
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // AI SDK v6 data-stream protocol emits server-sent-events lines
    // `data: <json>\n\n`. We just parse those.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        chunks.push(JSON.parse(payload));
      } catch {
        // ignore non-JSON data lines
      }
    }
  }
  return chunks;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  callToolMock.mockReset();
  listMcpToolsMock.mockReset();
  streamTextMock.mockReset();
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
});

afterEach(() => {
  process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL;
});

describe("POST /api/chat — happy path (US1)", () => {
  it("streams text-delta events and terminates with a finish event for a text-only request", async () => {
    listMcpToolsMock.mockResolvedValue([]);

    fakeStreamResult({
      chunks: [
        { type: "start" },
        { type: "text-start", id: "m1" },
        { type: "text-delta", id: "m1", delta: "Hello" },
        { type: "text-delta", id: "m1", delta: " there" },
        { type: "text-end", id: "m1" },
        { type: "finish" },
      ],
      onCall: () => {
        /* no-op */
      },
    });

    const response = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(200);
    const chunks = await readChunks(response);
    const types = chunks.map((c) => c.type);
    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
    expect(types).not.toContain("error");
  });

  it("streams a tool-call followed by a tool-result with mocked MCP payload", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "search_products",
        description: "search",
        inputSchema: {
          type: "object",
          properties: { q: { type: "string" } },
          required: ["q"],
        },
      },
    ]);
    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: '{"rows":[{"id":1,"name":"Monitor"}]}' }],
    });

    fakeStreamResult({
      chunks: [
        { type: "start" },
        { type: "tool-input-available", toolCallId: "c1", toolName: "search_products", input: { q: "monitor" } },
        { type: "tool-output-available", toolCallId: "c1", output: { rows: [{ id: 1 }] } },
        { type: "text-delta", id: "m2", delta: "Found 1 product." },
        { type: "finish" },
      ],
      onCall: () => {
        /* tools are validated via the route's sawToolCall flag; the
         * synthetic chunk types trigger the onChunk handler for us. */
      },
    });

    const response = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "do I have any monitors?" },
        ],
        conversationId: "c-123",
      }),
    );

    expect(response.status).toBe(200);
    const chunks = await readChunks(response);
    const types = chunks.map((c) => c.type);
    expect(types).toContain("tool-input-available");
    expect(types).toContain("tool-output-available");
    expect(types).toContain("text-delta");
    expect(types).not.toContain("error");
  });

  it("echoes conversationId in log lines when supplied", async () => {
    listMcpToolsMock.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    fakeStreamResult({
      chunks: [{ type: "text-delta", id: "x", delta: "ok" }, { type: "finish" }],
      onCall: () => {
        /* no-op */
      },
    });

    const response = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        conversationId: "conv-abc",
      }),
    );
    await readChunks(response);

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("[chat] turn_received");
    expect(logged).toContain('conversationId="conv-abc"');
    logSpy.mockRestore();
  });

  it("passes an empty MCP tool result through without truncation", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "search_products",
        description: "search",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ]);
    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
    });

    fakeStreamResult({
      chunks: [
        { type: "tool-input-available", toolCallId: "c2", toolName: "search_products", input: {} },
        { type: "tool-output-available", toolCallId: "c2", output: { rows: [] } },
        { type: "text-delta", id: "z", delta: "No matches." },
        { type: "finish" },
      ],
      onCall: () => {
        /* no-op */
      },
    });

    const response = await POST(
      makeRequest({ messages: [{ role: "user", content: "anything?" }] }),
    );
    const chunks = await readChunks(response);
    const types = chunks.map((c) => c.type);
    expect(types).toContain("text-delta");
    expect(types).not.toContain("error");
  });

  it("can produce multiple tool-call steps within the 5-step budget", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "search_products",
        description: "search",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ]);
    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
    });

    fakeStreamResult({
      chunks: [
        { type: "tool-input-available", toolCallId: "a", toolName: "search_products", input: {} },
        { type: "tool-output-available", toolCallId: "a", output: {} },
        { type: "tool-input-available", toolCallId: "b", toolName: "search_products", input: {} },
        { type: "tool-output-available", toolCallId: "b", output: {} },
        { type: "text-delta", id: "t", delta: "Done." },
        { type: "finish" },
      ],
      onCall: () => {
        /* no-op */
      },
    });

    const response = await POST(
      makeRequest({ messages: [{ role: "user", content: "search twice" }] }),
    );
    const chunks = await readChunks(response);
    const toolCalls = chunks.filter((c) => c.type === "tool-input-available");
    expect(toolCalls.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
  });
});
