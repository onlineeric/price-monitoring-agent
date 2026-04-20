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

import { POST } from "@/app/api/chat/route";

async function drain(response: Response) {
  if (!response.body) throw new Error("response.body missing");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(decoder.decode(value, { stream: true }));
  }
  return out.join("");
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

describe("POST /api/chat — concurrent turns (FR-013)", () => {
  it("keeps per-turn log lines and tool results isolated across overlapping turns", async () => {
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

    // Each turn receives its own payload; the callToolMock resolves based on
    // the `q` argument so the two concurrent turns get distinct results.
    callToolMock.mockImplementation(
      async ({ arguments: args }: { arguments: Record<string, unknown> }) => {
        await new Promise((r) => setTimeout(r, 10));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ q: args.q, rows: [`row-for-${String(args.q)}`] }),
            },
          ],
        };
      },
    );

    const capturedExecutes: Array<{
      turnMarker: string;
      toolCallId: string;
      result: unknown;
    }> = [];

    // Build streamText that invokes the real wrapped tool via options.tools
    // so the mocked MCP callTool path is exercised end-to-end per turn.
    streamTextMock.mockImplementation((opts: Record<string, unknown>) => {
      const tools = opts.tools as Record<
        string,
        { execute: (a: unknown, o: { toolCallId: string }) => Promise<unknown> }
      >;
      // Use the first user message content as the turn marker to keep the
      // test assertion deterministic (different markers per turn).
      const userMessage = (opts.messages as Array<{ content: string }>)[0]
        ?.content ?? "?";
      const toolCallId = `call-${userMessage.replace(/\s+/g, "-")}`;
      const pending = tools.search_products
        .execute(
          { q: userMessage.split(" ").pop() ?? "?" },
          { toolCallId },
        )
        .then((result) => {
          capturedExecutes.push({ turnMarker: userMessage, toolCallId, result });
        });

      const stream = new ReadableStream<Record<string, unknown>>({
        async start(controller) {
          await pending;
          controller.enqueue({
            type: "text-delta",
            id: "t",
            delta: `answer for ${userMessage}`,
          });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      });

      return {
        toUIMessageStream: () => stream,
        finishReason: Promise.resolve("stop"),
      };
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const [respA, respB] = await Promise.all([
      POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "search monitors" }],
            conversationId: "CONV-A",
          }),
        }),
      ),
      POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "search keyboards" }],
            conversationId: "CONV-B",
          }),
        }),
      ),
    ]);

    const [bodyA, bodyB] = await Promise.all([drain(respA), drain(respB)]);
    expect(bodyA).toContain("answer for search monitors");
    expect(bodyB).toContain("answer for search keyboards");

    // Each tool call got its own args and its own toolCallId.
    const turnMarkers = capturedExecutes.map((e) => e.turnMarker).sort();
    expect(turnMarkers).toEqual(["search keyboards", "search monitors"]);

    const foundA = capturedExecutes.find(
      (e) => e.turnMarker === "search monitors",
    );
    const foundB = capturedExecutes.find(
      (e) => e.turnMarker === "search keyboards",
    );
    if (!foundA || !foundB) throw new Error("expected both tool calls captured");
    const resultA = foundA.result as { content: Array<{ text: string }> };
    const resultB = foundB.result as { content: Array<{ text: string }> };
    expect(JSON.parse(resultA.content[0].text).q).toBe("monitors");
    expect(JSON.parse(resultB.content[0].text).q).toBe("keyboards");

    // Log lines carry the right conversationId / turnId pairing:
    //   - lines mentioning CONV-A MUST share a single turnId
    //   - lines mentioning CONV-B MUST share a different turnId
    //   - no line ties a CONV-A turnId to CONV-B or vice versa.
    const logLines = logSpy.mock.calls.map((c) => String(c[0]));
    const aLines = logLines.filter((l) => l.includes('conversationId="CONV-A"'));
    const bLines = logLines.filter((l) => l.includes('conversationId="CONV-B"'));
    expect(aLines.length).toBeGreaterThan(0);
    expect(bLines.length).toBeGreaterThan(0);

    function extractTurnId(line: string): string | null {
      const match = line.match(/turnId="([^"]+)"/);
      return match?.[1] ?? null;
    }

    const aTurnIds = new Set(aLines.map(extractTurnId).filter(Boolean));
    const bTurnIds = new Set(bLines.map(extractTurnId).filter(Boolean));
    expect(aTurnIds.size).toBe(1);
    expect(bTurnIds.size).toBe(1);
    const [aTurnId] = aTurnIds;
    const [bTurnId] = bTurnIds;
    if (!aTurnId || !bTurnId) throw new Error("expected two turn ids");
    expect(aTurnId).not.toBe(bTurnId);

    // And every log line that carries an A-turnId does NOT mention CONV-B.
    for (const line of logLines) {
      if (line.includes(aTurnId)) {
        expect(line).not.toContain('conversationId="CONV-B"');
      }
      if (line.includes(bTurnId)) {
        expect(line).not.toContain('conversationId="CONV-A"');
      }
    }

    logSpy.mockRestore();
  });
});
