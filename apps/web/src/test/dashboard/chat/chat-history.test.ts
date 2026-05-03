import { describe, expect, it } from "vitest";

import { serializeHistoryForApi } from "@/stores/chat/chat-history";
import type { AssistantMessage, DisplayedMessage, UserMessage } from "@/stores/chat/types";

function user(text: string): UserMessage {
  return { id: `u-${text}`, role: "user", text };
}

function assistant(
  state: AssistantMessage["state"],
  text: string,
  toolEvents: AssistantMessage["toolEvents"] = [],
): AssistantMessage {
  return {
    id: `a-${text}-${state}`,
    role: "assistant",
    text,
    state,
    toolEvents,
  };
}

describe("serializeHistoryForApi (FR-004a)", () => {
  it("emits user messages as UIMessage with a text part", () => {
    const messages: DisplayedMessage[] = [user("hello"), user("world")];
    expect(serializeHistoryForApi(messages)).toEqual([
      { id: "u-hello", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "u-world", role: "user", parts: [{ type: "text", text: "world" }] },
    ]);
  });

  it("emits a complete user+assistant pair as UIMessages", () => {
    const messages: DisplayedMessage[] = [user("hello"), assistant("complete", "hi there")];
    expect(serializeHistoryForApi(messages)).toEqual([
      { id: "u-hello", role: "user", parts: [{ type: "text", text: "hello" }] },
      {
        id: "a-hi there-complete",
        role: "assistant",
        parts: [{ type: "text", text: "hi there" }],
      },
    ]);
  });

  it("emits dynamic-tool parts for completed tools in order, alongside the assistant text", () => {
    const messages: DisplayedMessage[] = [
      user("show my products"),
      assistant("complete", "Here you go.", [
        {
          id: "call-1",
          toolName: "search_products",
          status: "completed",
          args: { q: "all" },
          result: { rows: [{ id: 1 }] },
        },
        {
          id: "call-2",
          toolName: "get_price_summary",
          status: "completed",
          args: { productId: 1 },
          result: { trend: "down" },
        },
      ]),
    ];

    const serialized = serializeHistoryForApi(messages);
    expect(serialized).toHaveLength(2);
    expect(serialized[1]).toEqual({
      id: "a-Here you go.-complete",
      role: "assistant",
      parts: [
        { type: "text", text: "Here you go." },
        {
          type: "dynamic-tool",
          toolName: "search_products",
          toolCallId: "call-1",
          state: "output-available",
          input: { q: "all" },
          output: { rows: [{ id: 1 }] },
        },
        {
          type: "dynamic-tool",
          toolName: "get_price_summary",
          toolCallId: "call-2",
          state: "output-available",
          input: { productId: 1 },
          output: { trend: "down" },
        },
      ],
    });
  });

  it("emits an output-error dynamic-tool part for failed tools", () => {
    const messages: DisplayedMessage[] = [
      user("add product"),
      assistant("complete", "I tried, but the URL was invalid.", [
        {
          id: "call-x",
          toolName: "add_product",
          status: "failed",
          args: { url: "bad" },
          errorEnvelope: { code: "invalid_url", message: "Bad URL" },
        },
      ]),
    ];

    const serialized = serializeHistoryForApi(messages);
    expect(serialized).toHaveLength(2);
    expect(serialized[1].parts[1]).toEqual({
      type: "dynamic-tool",
      toolName: "add_product",
      toolCallId: "call-x",
      state: "output-error",
      input: { url: "bad" },
      errorText: "Bad URL",
    });
  });

  it("drops stopped assistant turns and their tool events", () => {
    const messages: DisplayedMessage[] = [
      user("first"),
      assistant("complete", "response 1"),
      user("second"),
      assistant("stopped", "partial response", [{ id: "call-9", toolName: "search_products", status: "stopped" }]),
      user("third"),
    ];

    const serialized = serializeHistoryForApi(messages);
    const ordered = serialized.map((m) => `${m.role}:${m.id}`);
    expect(ordered).toEqual(["user:u-first", "assistant:a-response 1-complete", "user:u-second", "user:u-third"]);
  });

  it("drops errored assistant turns and their tool events", () => {
    const messages: DisplayedMessage[] = [
      user("first"),
      assistant("errored", "partial", [
        { id: "call-1", toolName: "search_products", status: "completed", result: { rows: [] } },
      ]),
      user("retry"),
    ];

    expect(serializeHistoryForApi(messages).map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("drops streaming assistant turns (still in flight)", () => {
    const messages: DisplayedMessage[] = [user("hi"), assistant("streaming", "thi")];

    expect(serializeHistoryForApi(messages).map((m) => m.role)).toEqual(["user"]);
  });

  it("preserves overall ordering across mixed completed/incomplete turns", () => {
    const messages: DisplayedMessage[] = [
      user("a"),
      assistant("complete", "A1", [
        { id: "t1", toolName: "search_products", status: "completed", result: { ok: true } },
      ]),
      user("b"),
      assistant("stopped", "skipped"),
      user("c"),
      assistant("complete", "C1"),
    ];

    const serialized = serializeHistoryForApi(messages);
    expect(serialized.map((m) => `${m.role}:${m.parts.length}`)).toEqual([
      "user:1",
      "assistant:2", // text + 1 dynamic-tool
      "user:1",
      "user:1",
      "assistant:1", // text only
    ]);
  });

  it("emits an assistant message with only tool parts when the text is empty", () => {
    const messages: DisplayedMessage[] = [
      user("ping"),
      assistant("complete", "", [{ id: "t1", toolName: "search_products", status: "completed", result: null }]),
    ];

    const serialized = serializeHistoryForApi(messages);
    expect(serialized).toHaveLength(2);
    expect(serialized[1]).toEqual({
      id: "a--complete",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "search_products",
          toolCallId: "t1",
          state: "output-available",
          input: {},
          output: null,
        },
      ],
    });
  });

  it("drops an assistant turn whose only tool events are running/stopped (no useful parts)", () => {
    const messages: DisplayedMessage[] = [
      user("hi"),
      assistant("complete", "", [{ id: "t1", toolName: "search_products", status: "stopped" }]),
      user("again"),
    ];
    // Empty-parts assistant is dropped to keep the model from seeing a no-op turn.
    expect(serializeHistoryForApi(messages).map((m) => m.role)).toEqual(["user", "user"]);
  });
});
