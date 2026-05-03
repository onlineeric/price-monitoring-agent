import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/stores/chat/chat-store";
import { consumeChatStream } from "@/stores/chat/chat-stream";
import type { AssistantMessage } from "@/stores/chat/types";

/**
 * Build a Response whose body is a v6 UI-message-stream (SSE-encoded).
 * Each chunk becomes `data: <json>\n\n`. The terminal blank line is
 * appended automatically.
 */
function makeUiMessageStreamResponse(chunks: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
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
    __streamConsumer: consumeChatStream,
  } as never);
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Chat page — streaming (US1)", () => {
  it("appends text-delta chunks incrementally to the assistant bubble", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        makeUiMessageStreamResponse([
          { type: "start", messageId: "m1" },
          { type: "start-step" },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Hello" },
          { type: "text-delta", id: "t1", delta: " there" },
          { type: "text-end", id: "t1" },
          { type: "finish-step" },
          { type: "finish" },
        ]),
      );

    await useChatStore.getState().send("hi");

    const state = useChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.messages).toHaveLength(2);
    const assistant = state.messages[1] as AssistantMessage;
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("Hello there");
    expect(assistant.state).toBe("complete");
  });

  it("includes prior turns in the request body for follow-ups", async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce(
      makeUiMessageStreamResponse([
        { type: "start" },
        { type: "text-delta", id: "t1", delta: "First answer." },
        { type: "finish" },
      ]),
    );
    fetchSpy.mockResolvedValueOnce(
      makeUiMessageStreamResponse([
        { type: "start" },
        { type: "text-delta", id: "t2", delta: "Second answer." },
        { type: "finish" },
      ]),
    );
    globalThis.fetch = fetchSpy;

    await useChatStore.getState().send("first question");
    await useChatStore.getState().send("follow-up");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchSpy.mock.calls[1][1] as { body: string }).body);
    expect(secondBody.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "first question" }] },
      { role: "assistant", parts: [{ type: "text", text: "First answer." }] },
      { role: "user", parts: [{ type: "text", text: "follow-up" }] },
    ]);
    // Same conversationId on both requests.
    const firstBody = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(secondBody.conversationId).toBe(firstBody.conversationId);
  });

  it("renders streamed markdown deltas through MarkdownContent", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        makeUiMessageStreamResponse([
          { type: "start" },
          { type: "text-delta", id: "t1", delta: "**bold** and " },
          { type: "text-delta", id: "t1", delta: "_italic_" },
          { type: "finish" },
        ]),
      );

    await useChatStore.getState().send("test");
    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.text).toBe("**bold** and _italic_");

    // The component is exercised in `markdown-content.test.tsx`; here we just
    // confirm the store collected the markdown source verbatim ready to be
    // rendered.
  });
});
