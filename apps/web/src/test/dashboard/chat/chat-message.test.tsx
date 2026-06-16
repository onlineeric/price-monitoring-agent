import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatMessage } from "@/app/(main)/dashboard/chat/_components/chat-message";
import { ChatProductProvider } from "@/app/(main)/dashboard/chat/_components/chat-product-context";
import type { AssistantMessage, ToolCallEvent } from "@/stores/chat/types";

function searchToolEvent(products: unknown[]): ToolCallEvent {
  return {
    id: "tool-1",
    toolName: "search_products",
    status: "completed",
    result: { content: [{ type: "text", text: JSON.stringify(products) }] },
  };
}

function assistant(message: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: "m1",
    role: "assistant",
    text: "",
    toolEvents: [],
    state: "complete",
    ...message,
  };
}

function renderMessage(message: AssistantMessage) {
  return render(
    <ChatProductProvider value={{ openProduct: () => undefined }}>
      <ChatMessage message={message} />
    </ChatProductProvider>,
  );
}

describe("ChatMessage — product cards", () => {
  it("renders product cards when the reply retrieved products", () => {
    renderMessage(
      assistant({
        text: "Here are some matches.",
        toolEvents: [searchToolEvent([{ id: "p1", name: "Widget", url: "https://shop/p1", currentPriceFormatted: "USD 9.99" }])],
      }),
    );

    expect(screen.getByTestId("chat-product-cards")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("renders no product cards for a text-only reply", () => {
    renderMessage(assistant({ text: "Hello there!" }));
    expect(screen.queryByTestId("chat-product-cards")).toBeNull();
  });

  it("renders no product cards when the search returned nothing", () => {
    renderMessage(
      assistant({
        text: "Nothing matched.",
        toolEvents: [
          {
            id: "tool-2",
            toolName: "search_products",
            status: "completed",
            result: { content: [{ type: "text", text: 'No products found matching "ghost".' }] },
          },
        ],
      }),
    );
    expect(screen.queryByTestId("chat-product-cards")).toBeNull();
  });
});
