import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/stores/chat/chat-store";
import type { AssistantMessage } from "@/stores/chat/types";

type StreamConsumerArgs = Parameters<
  ReturnType<typeof useChatStore.getState>["__streamConsumer" extends keyof unknown ? never : never]
>;

// We re-fetch the store between tests to keep state isolated.
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

function makeOkResponse(): Response {
  // Minimal Response that has a non-null body. The real reducer is replaced
  // via the __streamConsumer seam below, so the body content does not matter.
  return new Response(new ReadableStream<Uint8Array>(), { status: 200 });
}

function makePreStreamErrorResponse(
  status: number,
  code: string,
  message: string,
): Response {
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

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "hello there" }] },
    ]);
    expect(body.conversationId).toMatch(/[0-9a-f-]{36}/);
  });

  it("marks the assistant errored on a pre-stream HTTP error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        makePreStreamErrorResponse(500, "provider_config_missing", "no key"),
      );

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
                toolEvents: [
                  { id: "t1", toolName: "search_products", status: "running" },
                ],
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
      .mockResolvedValueOnce(
        makePreStreamErrorResponse(502, "mcp_unreachable", "unreachable"),
      )
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
