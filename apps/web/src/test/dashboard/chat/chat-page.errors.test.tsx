import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPageClient } from "@/app/(main)/dashboard/chat/_components/chat-page-client";
import { useChatStore } from "@/stores/chat/chat-store";
import { consumeChatStream } from "@/stores/chat/chat-stream";
import type { AssistantMessage, ChatErrorCode } from "@/stores/chat/types";

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

function makePreStreamErrorResponse(
  status: number,
  code: ChatErrorCode,
  message: string,
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
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

describe("Chat page — errors (US3)", () => {
  describe("pre-stream errors render with the correct retry affordance", () => {
    const cases: Array<{ code: ChatErrorCode; status: number; retryable: boolean }> = [
      { code: "validation_error", status: 400, retryable: false },
      { code: "provider_config_missing", status: 500, retryable: false },
      { code: "mcp_unreachable", status: 502, retryable: true },
    ];

    for (const { code, status, retryable } of cases) {
      it(`${code} → block visible, retry ${retryable ? "shown" : "hidden"}`, async () => {
        globalThis.fetch = vi
          .fn()
          .mockResolvedValue(makePreStreamErrorResponse(status, code, `mock ${code}`));

        render(<ChatPageClient />);
        await useChatStore.getState().send("hello");

        const block = await screen.findByTestId("chat-error-block");
        expect(block).toBeInTheDocument();
        expect(block.getAttribute("data-error-code")).toBe(code);

        const retryButton = screen.queryByRole("button", { name: /retry/i });
        if (retryable) {
          expect(retryButton).toBeInTheDocument();
        } else {
          expect(retryButton).not.toBeInTheDocument();
        }
      });
    }
  });

  describe("in-stream errors render with the correct retry affordance", () => {
    const cases: Array<{ code: ChatErrorCode; retryable: boolean }> = [
      { code: "provider_error", retryable: true },
      { code: "step_budget_exceeded", retryable: true },
      { code: "turn_timeout", retryable: true },
      { code: "empty_response", retryable: true },
    ];

    for (const { code, retryable } of cases) {
      it(`${code} → block visible, retry ${retryable ? "shown" : "hidden"}`, async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
          makeUiMessageStreamResponse([
            { type: "start" },
            { type: "text-delta", id: "t1", delta: "starting…" },
            {
              type: "error",
              errorText: JSON.stringify({
                error: { code, message: `mock ${code}` },
              }),
            },
          ]),
        );

        render(<ChatPageClient />);
        await useChatStore.getState().send("hello");

        const block = await screen.findByTestId("chat-error-block");
        expect(block.getAttribute("data-error-code")).toBe(code);

        const retryButton = screen.queryByRole("button", { name: /retry/i });
        if (retryable) {
          expect(retryButton).toBeInTheDocument();
        } else {
          expect(retryButton).not.toBeInTheDocument();
        }

        // Partial assistant text streamed BEFORE the error must be preserved.
        const last = useChatStore.getState().messages[1] as AssistantMessage;
        expect(last.text).toBe("starting…");
        expect(last.state).toBe("errored");
      });
    }
  });

  it("Stop preserves the partial assistant turn and flips a running tool indicator to stopped", async () => {
    let release!: () => void;
    const consumerWaits = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream<Uint8Array>(), { status: 200 }));

    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        // Inject some streaming state, then hang.
        useChatStore.setState((state) => {
          const next = [...state.messages];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = {
                ...(next[i] as AssistantMessage),
                text: "partial reply",
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

    render(<ChatPageClient />);
    void useChatStore.getState().send("test");
    await new Promise((r) => setTimeout(r, 30));

    fireEvent.click(screen.getByTestId("chat-stop-button"));

    const after = useChatStore.getState();
    expect(after.status).toBe("idle");
    const last = after.messages[1] as AssistantMessage;
    expect(last.state).toBe("stopped");
    expect(last.text).toBe("partial reply");
    expect(last.toolEvents[0].status).toBe("stopped");

    release();
  });

  it("blocks a second send while the first is streaming (overlap prevention)", async () => {
    let release!: () => void;
    const consumerWaits = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream<Uint8Array>(), { status: 200 }));
    globalThis.fetch = fetchSpy;
    useChatStore.setState({
      __streamConsumer: vi.fn(async () => {
        await consumerWaits;
      }),
    } as never);

    void useChatStore.getState().send("first");
    await new Promise((r) => setTimeout(r, 10));
    expect(useChatStore.getState().status).toBe("streaming");

    await useChatStore.getState().send("second");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    release();
  });

  it("char-counter appears past 8000 chars and Send is disabled past 10000", () => {
    render(<ChatPageClient />);

    const textarea = screen.getByTestId("chat-input-textarea") as HTMLTextAreaElement;
    const sendButton = screen.getByTestId("chat-send-button") as HTMLButtonElement;

    // Below the 8000 visibility threshold.
    fireEvent.change(textarea, { target: { value: "x".repeat(7000) } });
    expect(screen.queryByTestId("chat-input-counter")).not.toBeInTheDocument();
    expect(sendButton.disabled).toBe(false);

    // Past the visibility threshold.
    fireEvent.change(textarea, { target: { value: "x".repeat(8500) } });
    expect(screen.getByTestId("chat-input-counter")).toBeInTheDocument();
    expect(sendButton.disabled).toBe(false);

    // Past the cap.
    fireEvent.change(textarea, { target: { value: "x".repeat(10_001) } });
    expect(sendButton.disabled).toBe(true);
  });

  it("clicking an autoSend=false starter chip populates the textarea AND enables Send", () => {
    render(<ChatPageClient />);

    // The empty state renders three chips. The "Add a new product" chip is
    // autoSend=false — clicking it must populate the textarea and unlock Send,
    // proving React state stays in sync (regression for the
    // controlled-input bypass bug fixed in chat-page-client.tsx).
    fireEvent.click(screen.getByRole("button", { name: /add a new product/i }));

    const textarea = screen.getByTestId("chat-input-textarea") as HTMLTextAreaElement;
    const sendButton = screen.getByTestId("chat-send-button") as HTMLButtonElement;
    expect(textarea.value).toBe("Add this product: [paste URL]");
    expect(sendButton.disabled).toBe(false);
  });
});
