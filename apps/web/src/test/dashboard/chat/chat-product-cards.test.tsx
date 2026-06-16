import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatProductCards } from "@/app/(main)/dashboard/chat/_components/chat-product-cards";
import { ChatProductProvider } from "@/app/(main)/dashboard/chat/_components/chat-product-context";
import type { MessageProductSurface, RetrievedProduct } from "@/lib/chat/product-cards";

function rp(id: string, overrides: Partial<RetrievedProduct> = {}): RetrievedProduct {
  return {
    id,
    name: `Product ${id}`,
    url: `https://shop/${id}`,
    currentPriceFormatted: "NZD 10.00",
    currentPriceCents: 1000,
    currency: "NZD",
    ...overrides,
  };
}

function surface(cards: RetrievedProduct[], overflowCount = 0): MessageProductSurface {
  return { byId: new Map(cards.map((c) => [c.id, c])), cards, overflowCount };
}

function renderCards(s: MessageProductSurface, openProduct = vi.fn()) {
  return {
    openProduct,
    ...render(
      <ChatProductProvider value={{ openProduct }}>
        <ChatProductCards surface={s} />
      </ChatProductProvider>,
    ),
  };
}

describe("ChatProductCards", () => {
  it("renders one card per product with name and price, and opens on click", () => {
    const { openProduct } = renderCards(surface([rp("a"), rp("b")]));

    const cards = screen.getAllByTestId("chat-product-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Product a")).toBeInTheDocument();
    expect(screen.getAllByText("NZD 10.00")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open details for Product a" }));
    expect(openProduct).toHaveBeenCalledWith("a");
  });

  it("shows a '+N more matched' note when there is overflow", () => {
    renderCards(surface([rp("a"), rp("b"), rp("c"), rp("d"), rp("e")], 3));
    expect(screen.getByTestId("chat-product-overflow").textContent).toContain("+3 more matched");
  });

  it("renders nothing when there are no cards", () => {
    renderCards(surface([]));
    expect(screen.queryByTestId("chat-product-cards")).toBeNull();
  });

  it("shows a placeholder when a product has no formatted price", () => {
    renderCards(surface([rp("a", { currentPriceFormatted: null })]));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
