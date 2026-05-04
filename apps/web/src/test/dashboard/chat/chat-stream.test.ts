import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeChatStream,
  __testing as streamTesting,
} from "@/stores/chat/chat-stream";
import type { AssistantMessage, ChatState, DisplayedMessage } from "@/stores/chat/types";

/**
 * Direct tests for `chat-stream.ts`. The chat-store suite already covers the
 * post-stop / post-error reducer guards via `__testing.applyStreamPart`; this
 * file pins the happy-path branches and `consumeChatStream` itself:
 *
 *   - text-delta accumulates onto the assistant text
 *   - tool-input-available appends a `running` tool event with args
 *   - tool-output-available with non-error output flips it to `completed`
 *   - tool-output-error attaches a structured envelope and flips to `failed`
 *   - finish flips the assistant to `complete` and conversation to `idle`
 *   - error flips to `errored` AND surfaces every running tool as `failed`
 *   - unknown chunk types log one warning and are otherwise ignored
 *   - consumeChatStream swallows AbortError and stops cleanly
 *   - consumeChatStream surfaces a synthetic provider_error for an empty body
 */

interface MutableState extends ChatState {
  // Local index so the helper can mutate without going through Zustand.
  [k: string]: unknown;
}

function makeState(messages: DisplayedMessage[]): MutableState {
  return {
    conversationId: null,
    messages,
    status: "streaming",
    error: null,
    abortController: null,
    send: async () => undefined,
    stop: () => undefined,
    retry: async () => undefined,
    reset: () => undefined,
  } as unknown as MutableState;
}

function makeSetter(state: MutableState) {
  return (updater: (s: ChatState) => Partial<ChatState>) => {
    const patch = updater(state) as Partial<ChatState>;
    Object.assign(state, patch);
  };
}

function streamingAssistant(): AssistantMessage {
  return {
    id: "a1",
    role: "assistant",
    text: "",
    toolEvents: [],
    state: "streaming",
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyStreamPart — happy path", () => {
  it("text-delta appends to the streaming assistant's text", () => {
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart({ type: "text-delta", id: "x", delta: "Hel" } as never, set);
    streamTesting.applyStreamPart({ type: "text-delta", id: "x", delta: "lo" } as never, set);

    const last = state.messages[1] as AssistantMessage;
    expect(last.text).toBe("Hello");
  });

  it("tool-input-available appends a `running` tool event carrying its args", () => {
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart(
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "search_products",
        input: { q: "monitor" },
      } as never,
      set,
    );

    const last = state.messages[1] as AssistantMessage;
    expect(last.toolEvents).toEqual([
      {
        id: "call-1",
        toolName: "search_products",
        status: "running",
        args: { q: "monitor" },
      },
    ]);
  });

  it("tool-output-available with non-error output flips a running tool to `completed`", () => {
    const state = makeState([
      { id: "u1", role: "user", text: "hi" },
      {
        id: "a1",
        role: "assistant",
        text: "",
        toolEvents: [{ id: "call-1", toolName: "search_products", status: "running" }],
        state: "streaming",
      },
    ]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart(
      { type: "tool-output-available", toolCallId: "call-1", output: { rows: [] } } as never,
      set,
    );

    const last = state.messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("completed");
    expect(last.toolEvents[0].result).toEqual({ rows: [] });
    expect(last.toolEvents[0].errorEnvelope).toBeUndefined();
  });

  it("tool-output-error attaches a structured envelope and flips to `failed`", () => {
    const state = makeState([
      { id: "u1", role: "user", text: "hi" },
      {
        id: "a1",
        role: "assistant",
        text: "",
        toolEvents: [{ id: "call-1", toolName: "add_product", status: "running" }],
        state: "streaming",
      },
    ]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart(
      {
        type: "tool-output-error",
        toolCallId: "call-1",
        errorText: JSON.stringify({ error: { code: "invalid_url", message: "Bad URL" } }),
      } as never,
      set,
    );

    const last = state.messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("failed");
    expect(last.toolEvents[0].errorEnvelope).toEqual({ code: "invalid_url", message: "Bad URL" });
  });

  it("tool-output-error falls back to a generic envelope when errorText is not a JSON envelope", () => {
    const state = makeState([
      { id: "u1", role: "user", text: "hi" },
      {
        id: "a1",
        role: "assistant",
        text: "",
        toolEvents: [{ id: "call-1", toolName: "add_product", status: "running" }],
        state: "streaming",
      },
    ]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart(
      { type: "tool-output-error", toolCallId: "call-1", errorText: "boom" } as never,
      set,
    );

    const last = state.messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("failed");
    expect(last.toolEvents[0].errorEnvelope).toEqual({ code: "tool_error", message: "boom" });
  });

  it("finish flips the assistant to `complete` and conversation status to `idle`", () => {
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart({ type: "finish" } as never, set);

    expect(state.status).toBe("idle");
    expect(state.abortController).toBeNull();
    expect((state.messages[1] as AssistantMessage).state).toBe("complete");
  });

  it("error flips to `errored` AND surfaces every running tool as `failed`", () => {
    const state = makeState([
      { id: "u1", role: "user", text: "hi" },
      {
        id: "a1",
        role: "assistant",
        text: "partial",
        toolEvents: [
          { id: "t1", toolName: "search_products", status: "running" },
          { id: "t2", toolName: "add_product", status: "completed", result: {} },
        ],
        state: "streaming",
      },
    ]);
    const set = makeSetter(state);

    streamTesting.applyStreamPart(
      {
        type: "error",
        errorText: JSON.stringify({ error: { code: "provider_error", message: "rate limited" } }),
      } as never,
      set,
    );

    expect(state.status).toBe("errored");
    expect(state.error?.code).toBe("provider_error");
    const last = state.messages[1] as AssistantMessage;
    expect(last.state).toBe("errored");
    expect(last.toolEvents[0].status).toBe("failed"); // running → failed
    expect(last.toolEvents[1].status).toBe("completed"); // already-terminal stays put
  });

  it("ignores no-op markers (start, start-step, text-start, text-end, finish-step, abort)", () => {
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    for (const type of ["start", "start-step", "text-start", "text-end", "finish-step", "abort"]) {
      streamTesting.applyStreamPart({ type, id: "x" } as never, set);
    }

    // No state should have been touched.
    expect((state.messages[1] as AssistantMessage).text).toBe("");
    expect((state.messages[1] as AssistantMessage).state).toBe("streaming");
    expect(state.status).toBe("streaming");
  });

  it("unknown chunk types log exactly one console.warn (deduplicated)", () => {
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);
    const warnSpy = vi.spyOn(console, "warn");

    streamTesting.applyStreamPart({ type: "future-thing" } as never, set);
    streamTesting.applyStreamPart({ type: "future-thing" } as never, set);

    const futureCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes("future-thing"));
    expect(futureCalls.length).toBe(1);
  });
});

describe("consumeChatStream", () => {
  it("surfaces a synthetic provider_error when the response body is null", async () => {
    const response = new Response(null, { status: 200 });
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    await consumeChatStream(response, set, new AbortController().signal);

    expect(state.status).toBe("errored");
    expect((state.messages[1] as AssistantMessage).state).toBe("errored");
  });

  it("swallows AbortError thrown mid-read (the user pressing Stop is not an error)", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      pull(streamController) {
        controller.abort();
        streamController.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
      },
    });
    const response = new Response(stream, { status: 200 });
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    await expect(consumeChatStream(response, set, controller.signal)).resolves.toBeUndefined();
    // No error surfaced — Stop() owns the user-visible state transition.
    expect(state.status).not.toBe("errored");
  });

  it("processes a complete v6 SSE stream end-to-end", async () => {
    const events = [
      { type: "start" },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Hello " },
      { type: "text-delta", id: "t", delta: "world" },
      { type: "text-end", id: "t" },
      { type: "finish" },
    ];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        controller.close();
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const state = makeState([{ id: "u1", role: "user", text: "hi" }, streamingAssistant()]);
    const set = makeSetter(state);

    await consumeChatStream(response, set, new AbortController().signal);

    const last = state.messages[1] as AssistantMessage;
    expect(last.text).toBe("Hello world");
    expect(last.state).toBe("complete");
    expect(state.status).toBe("idle");
  });
});
