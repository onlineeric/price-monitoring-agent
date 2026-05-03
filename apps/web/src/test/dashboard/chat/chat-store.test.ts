import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/stores/chat/chat-store";
import { consumeChatStream, __testing as streamTesting } from "@/stores/chat/chat-stream";
import type { AssistantMessage, ChatState } from "@/stores/chat/types";

// We re-fetch the store between tests to keep state isolated. The store is a
// module-level singleton so we MUST also restore `__streamConsumer` to the
// real implementation — otherwise a mock injected by an earlier test leaks
// forward and silently replaces the real reducer in later tests.
//
// The store is wrapped in `persist` middleware (localStorage), so we also
// clear the persisted slot — otherwise a setState in one `it` block leaks
// into the next via storage.
function resetStore() {
  globalThis.localStorage?.clear();
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

function makeOkResponse(): Response {
  // Minimal Response that has a non-null body. The real reducer is replaced
  // via the __streamConsumer seam below, so the body content does not matter.
  return new Response(new ReadableStream<Uint8Array>(), { status: 200 });
}

function makePreStreamErrorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useChatStore.send", () => {
  it("rejects re-entry while streaming", async () => {
    let release!: () => void;
    const consumerWaits = new Promise<void>((resolve) => {
      release = resolve;
    });

    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        await consumerWaits;
      }),
    } as never);

    const first = useChatStore.getState().send("hello");
    // Wait until status flips to streaming, then attempt re-entry.
    await Promise.resolve();
    await Promise.resolve();
    expect(useChatStore.getState().status).toBe("streaming");

    const before = useChatStore.getState().messages.length;
    await useChatStore.getState().send("ignored");
    const after = useChatStore.getState().messages.length;
    expect(after).toBe(before);

    release();
    await first;
  });

  it("generates a conversationId on the first send only", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    const finishConsumer = vi.fn(async () => {
      // Simulate a clean finish so status returns to idle.
      useChatStore.setState((state) => {
        const next = [...state.messages];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "assistant") {
            next[i] = { ...(next[i] as AssistantMessage), state: "complete" };
            break;
          }
        }
        return {
          messages: next,
          status: "idle",
          abortController: null,
        };
      });
    });
    useChatStore.setState({ __streamConsumer: finishConsumer } as never);

    await useChatStore.getState().send("first");
    const id1 = useChatStore.getState().conversationId;
    expect(id1).toMatch(/[0-9a-f-]{36}/);

    await useChatStore.getState().send("second");
    const id2 = useChatStore.getState().conversationId;
    expect(id2).toBe(id1);
  });

  it("invokes the FR-004a serializer in the request body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeOkResponse());
    globalThis.fetch = fetchSpy;
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        useChatStore.setState({ status: "idle", abortController: null });
      }),
    } as never);

    await useChatStore.getState().send("hello there");

    expect(fetchSpy).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body.messages).toMatchObject([{ role: "user", parts: [{ type: "text", text: "hello there" }] }]);
    expect(body.conversationId).toMatch(/[0-9a-f-]{36}/);
  });

  it("sends the full multi-turn history (text + completed tool calls) on a follow-up turn (FR-004a / task 3.6)", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(makeOkResponse()).mockResolvedValueOnce(makeOkResponse());
    globalThis.fetch = fetchSpy;

    // First turn: stream consumer simulates a complete assistant turn that
    // includes one completed tool call, then transitions to `complete`.
    let consumerCall = 0;
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        consumerCall += 1;
        useChatStore.setState((state) => {
          const next = [...state.messages];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              const baseAssistant = next[i] as AssistantMessage;
              next[i] = {
                ...baseAssistant,
                state: "complete",
                text: consumerCall === 1 ? "Found one." : "Sure.",
                toolEvents:
                  consumerCall === 1
                    ? [
                        {
                          id: "call-1",
                          toolName: "search_products",
                          status: "completed",
                          args: { q: "monitor" },
                          result: { rows: [{ id: 7, name: "Sony" }] },
                        },
                      ]
                    : baseAssistant.toolEvents,
              };
              break;
            }
          }
          return { messages: next, status: "idle", abortController: null };
        });
      }),
    } as never);

    await useChatStore.getState().send("show monitors");
    const firstConvId = useChatStore.getState().conversationId;

    await useChatStore.getState().send("tell me more");
    const secondConvId = useChatStore.getState().conversationId;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(secondConvId).toBe(firstConvId);

    const secondBody = JSON.parse((fetchSpy.mock.calls[1][1] as { body: string }).body);
    expect(secondBody.conversationId).toBe(firstConvId);

    // Multi-turn payload: prior user, prior assistant (text + dynamic-tool),
    // then the new user message.
    expect(secondBody.messages).toHaveLength(3);
    expect(secondBody.messages[0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "show monitors" }],
    });
    expect(secondBody.messages[1]).toMatchObject({
      role: "assistant",
      parts: [
        { type: "text", text: "Found one." },
        {
          type: "dynamic-tool",
          toolName: "search_products",
          toolCallId: "call-1",
          state: "output-available",
          input: { q: "monitor" },
          output: { rows: [{ id: 7, name: "Sony" }] },
        },
      ],
    });
    expect(secondBody.messages[2]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "tell me more" }],
    });
  });

  it("marks the assistant errored on a pre-stream HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makePreStreamErrorResponse(500, "provider_config_missing", "no key"));

    await useChatStore.getState().send("hello");

    const state = useChatStore.getState();
    expect(state.status).toBe("errored");
    expect(state.error?.code).toBe("provider_config_missing");
    const last = state.messages[state.messages.length - 1] as AssistantMessage;
    expect(last.role).toBe("assistant");
    expect(last.state).toBe("errored");
  });
});

describe("useChatStore.stop", () => {
  it("flips active assistant to stopped and every running tool to stopped", async () => {
    let release!: () => void;
    const consumerWaits = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        // Inject a running tool indicator into the active assistant.
        useChatStore.setState((state) => {
          const next = [...state.messages];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = {
                ...(next[i] as AssistantMessage),
                toolEvents: [{ id: "t1", toolName: "search_products", status: "running" }],
              };
              break;
            }
          }
          return { messages: next };
        });
        await consumerWaits;
      }),
    } as never);

    const sendPromise = useChatStore.getState().send("hello");
    // Wait for the consumer to inject the tool indicator.
    await new Promise((r) => setTimeout(r, 10));
    expect(useChatStore.getState().status).toBe("streaming");

    useChatStore.getState().stop();

    const after = useChatStore.getState();
    expect(after.status).toBe("idle");
    const last = after.messages[after.messages.length - 1] as AssistantMessage;
    expect(last.state).toBe("stopped");
    expect(last.toolEvents[0].status).toBe("stopped");

    release();
    await sendPromise;
  });

  it("is a no-op when not streaming", () => {
    const before = useChatStore.getState().messages.length;
    useChatStore.getState().stop();
    expect(useChatStore.getState().messages.length).toBe(before);
  });
});

describe("useChatStore.retry", () => {
  it("removes the trailing errored assistant and re-sends with the same conversationId", async () => {
    // First send fails pre-stream.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(makePreStreamErrorResponse(502, "mcp_unreachable", "unreachable"))
      .mockResolvedValueOnce(makeOkResponse());

    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        useChatStore.setState((state) => {
          const next = [...state.messages];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = { ...(next[i] as AssistantMessage), state: "complete" };
              break;
            }
          }
          return { messages: next, status: "idle", abortController: null };
        });
      }),
    } as never);

    await useChatStore.getState().send("hi");
    const conversationId = useChatStore.getState().conversationId;
    expect(useChatStore.getState().status).toBe("errored");

    await useChatStore.getState().retry();
    const after = useChatStore.getState();
    expect(after.conversationId).toBe(conversationId);
    expect(after.status).toBe("idle");
    // After retry: one user + one complete assistant.
    expect(after.messages).toHaveLength(2);
    expect(after.messages[0].role).toBe("user");
    expect(after.messages[1].role).toBe("assistant");
    expect((after.messages[1] as AssistantMessage).state).toBe("complete");
  });

  it("is a no-op when not in errored state", async () => {
    const before = useChatStore.getState().messages.length;
    await useChatStore.getState().retry();
    expect(useChatStore.getState().messages.length).toBe(before);
  });
});

describe("stream reducer guards (post-stop / post-error)", () => {
  it("ignores text-delta and tool-output chunks that arrive after the assistant is stopped", () => {
    // Seed a message thread with one assistant in the `stopped` state and one
    // tool indicator that was already flipped to `stopped` by the Stop action.
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", text: "hi" },
        {
          id: "a1",
          role: "assistant",
          text: "partial",
          toolEvents: [{ id: "t1", toolName: "search_products", status: "stopped" }],
          state: "stopped",
        },
      ],
    } as never);

    const setUpdater = (updater: (state: ChatState) => Partial<ChatState>) => {
      useChatStore.setState((current) => updater(current as ChatState) as never);
    };

    // Late chunks the SDK was holding when stop() fired.
    streamTesting.applyStreamPart({ type: "text-delta", id: "t1", delta: " more" } as never, setUpdater);
    streamTesting.applyStreamPart(
      { type: "tool-output-available", toolCallId: "t1", output: { ok: true } } as never,
      setUpdater,
    );
    streamTesting.applyStreamPart({ type: "finish" } as never, setUpdater);

    const after = useChatStore.getState();
    const last = after.messages[1] as AssistantMessage;
    expect(last.text).toBe("partial"); // text was NOT mutated
    expect(last.state).toBe("stopped"); // finish did NOT flip stopped → complete
    expect(last.toolEvents[0].status).toBe("stopped"); // tool stayed stopped
  });

  it("ignores a tool-output-available for a tool whose status is already terminal", () => {
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", text: "hi" },
        {
          id: "a1",
          role: "assistant",
          text: "",
          toolEvents: [{ id: "t1", toolName: "search_products", status: "completed", result: { rows: [] } }],
          state: "streaming",
        },
      ],
    } as never);

    const setUpdater = (updater: (state: ChatState) => Partial<ChatState>) => {
      useChatStore.setState((current) => updater(current as ChatState) as never);
    };

    // A duplicate tool-output-available with an error envelope must NOT flip
    // an already-completed tool to failed.
    streamTesting.applyStreamPart(
      {
        type: "tool-output-available",
        toolCallId: "t1",
        output: { error: { code: "x", message: "y" } },
      } as never,
      setUpdater,
    );

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("completed");
    expect(last.toolEvents[0].errorEnvelope).toBeUndefined();
  });

  it("flips a tool to `failed` when the MCP CallToolResult shape carries an error envelope", () => {
    // The chat-tools bridge returns `{ isError: true, content: [{ type: "text",
    // text: JSON.stringify({ error: { code, message } }) }] }` for both
    // server-side tool failures and bridge-caught transport errors. The
    // earlier extractor only matched a flat `{ error }` shape and would mark
    // the indicator `completed` here — see PR #42 review for the regression.
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", text: "hi" },
        {
          id: "a1",
          role: "assistant",
          text: "",
          toolEvents: [{ id: "t1", toolName: "search_products", status: "running" }],
          state: "streaming",
        },
      ],
    } as never);

    const setUpdater = (updater: (state: ChatState) => Partial<ChatState>) => {
      useChatStore.setState((current) => updater(current as ChatState) as never);
    };

    streamTesting.applyStreamPart(
      {
        type: "tool-output-available",
        toolCallId: "t1",
        output: {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: "INTERNAL_ERROR", message: "boom" },
              }),
            },
          ],
        },
      } as never,
      setUpdater,
    );

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("failed");
    expect(last.toolEvents[0].errorEnvelope).toEqual({
      code: "INTERNAL_ERROR",
      message: "boom",
    });
  });

  it("falls back to a generic `tool_error` envelope when isError=true but the text is not a JSON envelope", () => {
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", text: "hi" },
        {
          id: "a1",
          role: "assistant",
          text: "",
          toolEvents: [{ id: "t1", toolName: "search_products", status: "running" }],
          state: "streaming",
        },
      ],
    } as never);

    const setUpdater = (updater: (state: ChatState) => Partial<ChatState>) => {
      useChatStore.setState((current) => updater(current as ChatState) as never);
    };

    streamTesting.applyStreamPart(
      {
        type: "tool-output-available",
        toolCallId: "t1",
        output: {
          isError: true,
          content: [{ type: "text", text: "not-a-json-envelope" }],
        },
      } as never,
      setUpdater,
    );

    const last = useChatStore.getState().messages[1] as AssistantMessage;
    expect(last.toolEvents[0].status).toBe("failed");
    expect(last.toolEvents[0].errorEnvelope?.code).toBe("tool_error");
  });
});

describe("localStorage persistence (refresh-survival)", () => {
  it("writes messages to localStorage on send so a refresh can restore them", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => undefined),
    } as never);

    await useChatStore.getState().send("hello");

    const raw = localStorage.getItem("price-monitor-chat");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: { messages: Array<{ role: string; text?: string }>; conversationId: string | null };
    };
    expect(parsed.state.messages).toHaveLength(2);
    expect(parsed.state.messages[0].role).toBe("user");
    expect(parsed.state.messages[0].text).toBe("hello");
    expect(parsed.state.conversationId).toMatch(/^[\da-f-]{10,}$/);
  });

  it("does not persist transient lifecycle fields (status, error, abortController)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => undefined),
    } as never);
    await useChatStore.getState().send("hi");

    const raw = localStorage.getItem("price-monitor-chat");
    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(parsed.state).not.toHaveProperty("status");
    expect(parsed.state).not.toHaveProperty("error");
    expect(parsed.state).not.toHaveProperty("abortController");
    expect(parsed.state).not.toHaveProperty("__streamConsumer");
  });

  it("flips a rehydrated message that was still `streaming` to `stopped`", () => {
    // Simulate the post-refresh rehydrate path by invoking the store's
    // persist API directly with a payload that mimics a tab closed mid-turn.
    localStorage.setItem(
      "price-monitor-chat",
      JSON.stringify({
        version: 1,
        state: {
          conversationId: "c-prev",
          messages: [
            { id: "u1", role: "user", text: "hi" },
            {
              id: "a1",
              role: "assistant",
              text: "answering",
              toolEvents: [{ id: "t1", toolName: "search_products", status: "running" }],
              state: "streaming",
            },
          ],
        },
      }),
    );

    // `rehydrate()` re-reads from storage and runs `onRehydrateStorage`.
    void useChatStore.persist.rehydrate();

    const after = useChatStore.getState();
    expect(after.conversationId).toBe("c-prev");
    expect(after.messages).toHaveLength(2);
    const assistant = after.messages[1] as AssistantMessage;
    expect(assistant.state).toBe("stopped");
    expect(assistant.toolEvents[0].status).toBe("stopped");
    // Lifecycle reset to idle so the page is interactive immediately.
    expect(after.status).toBe("idle");
    expect(after.error).toBeNull();
    expect(after.abortController).toBeNull();
  });
});

describe("useChatStore.reset", () => {
  it("aborts an in-flight turn before clearing", async () => {
    let release!: () => void;
    const consumerWaits = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse());
    const abortSpy = vi.fn();
    useChatStore.setState({
      __streamConsumer: vi.fn(async (_response, _set, signal) => {
        signal.addEventListener("abort", abortSpy);
        await consumerWaits;
      }),
    } as never);

    const sendPromise = useChatStore.getState().send("hi");
    await new Promise((r) => setTimeout(r, 10));
    expect(useChatStore.getState().status).toBe("streaming");

    useChatStore.getState().reset();

    expect(abortSpy).toHaveBeenCalled();
    const after = useChatStore.getState();
    expect(after.status).toBe("idle");
    expect(after.messages).toEqual([]);
    expect(after.conversationId).toBeNull();

    release();
    await sendPromise;
  });
});
