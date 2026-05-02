import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/stores/chat/chat-store";
import type { AssistantMessage } from "@/stores/chat/types";

function makeUiMessageStreamResponse(
  chunks: Array<Record<string, unknown>>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function resetStore() {
  useChatStore.setState({
    conversationId: null,
    messages: [],
    status: "idle",
    error: null,
    abortController: null,
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Chat page — tool-call indicators (US2)", () => {
  it("transitions running → completed on tool-output-available with a normal payload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeUiMessageStreamResponse([
        { type: "start" },
        {
          type: "tool-input-available",
          toolCallId: "c1",
          toolName: "search_products",
          input: { q: "monitor" },
        },
        {
          type: "tool-output-available",
          toolCallId: "c1",
          output: { rows: [{ id: 1 }] },
        },
        { type: "text-delta", id: "t1", delta: "Found one." },
        { type: "finish" },
      ]),
    );

    await useChatStore.getState().send("show monitors");

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents).toHaveLength(1);
    expect(last.toolEvents[0].toolName).toBe("search_products");
    expect(last.toolEvents[0].status).toBe("completed");
    expect(last.text).toBe("Found one.");
    expect(last.state).toBe("complete");
  });

  it("transitions running → failed when the tool output carries an error envelope, but continues streaming text", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeUiMessageStreamResponse([
        { type: "start" },
        {
          type: "tool-input-available",
          toolCallId: "c2",
          toolName: "add_product",
          input: { url: "https://broken.test/x" },
        },
        {
          type: "tool-output-available",
          toolCallId: "c2",
          output: { error: { code: "invalid_url", message: "Bad URL" } },
        },
        { type: "text-delta", id: "t2", delta: "Sorry, that URL is invalid." },
        { type: "finish" },
      ]),
    );

    await useChatStore.getState().send("add this");

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents).toHaveLength(1);
    expect(last.toolEvents[0].status).toBe("failed");
    expect(last.toolEvents[0].errorEnvelope).toEqual({
      code: "invalid_url",
      message: "Bad URL",
    });
    // The turn was NOT aborted by the tool failure.
    expect(last.text).toContain("Sorry");
    expect(last.state).toBe("complete");
  });

  it("renders two indicators in stream order for two sequential tool calls", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeUiMessageStreamResponse([
        { type: "start" },
        { type: "tool-input-available", toolCallId: "c1", toolName: "search_products", input: {} },
        { type: "tool-output-available", toolCallId: "c1", output: { rows: [] } },
        { type: "tool-input-available", toolCallId: "c2", toolName: "get_price_summary", input: {} },
        { type: "tool-output-available", toolCallId: "c2", output: { trend: "down" } },
        { type: "text-delta", id: "t1", delta: "Done." },
        { type: "finish" },
      ]),
    );

    await useChatStore.getState().send("everything please");

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents.map((e) => e.toolName)).toEqual([
      "search_products",
      "get_price_summary",
    ]);
    expect(last.toolEvents.every((e) => e.status === "completed")).toBe(true);
  });
});
