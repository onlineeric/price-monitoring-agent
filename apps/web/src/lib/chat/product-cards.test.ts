import { describe, expect, it } from "vitest";

import type { ToolCallEvent } from "@/stores/chat/types";

import { buildMessageProductSurface } from "./product-cards";

function product(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Product ${id}`,
    url: `https://shop/${id}`,
    currentPriceCents: 1000,
    currency: "NZD",
    currentPriceFormatted: "NZD 10.00",
    ...extra,
  };
}

/** A completed product-tool event whose result is the MCP CallToolResult shape. */
function toolEvent(
  toolName: string,
  text: string,
  status: ToolCallEvent["status"] = "completed",
  id = `${toolName}-call`,
): ToolCallEvent {
  return {
    id,
    toolName,
    status,
    result: { content: [{ type: "text", text }] },
  };
}

function jsonEvent(toolName: string, products: unknown[], status?: ToolCallEvent["status"], id?: string) {
  return toolEvent(toolName, JSON.stringify(products), status, id);
}

/** A completed product-tool event whose result carries several text content parts. */
function multiPartEvent(toolName: string, texts: string[], id = `${toolName}-call`): ToolCallEvent {
  return {
    id,
    toolName,
    status: "completed",
    result: { content: texts.map((text) => ({ type: "text", text })) },
  };
}

describe("buildMessageProductSurface", () => {
  it("returns cards mirroring a single search result", () => {
    const surface = buildMessageProductSurface([jsonEvent("search_products", [product("a"), product("b")])]);

    expect(surface.cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(surface.overflowCount).toBe(0);
    expect(surface.byId.size).toBe(2);
    expect(surface.cards[0]).toMatchObject({ id: "a", currentPriceFormatted: "NZD 10.00" });
  });

  it("merges two searches and deduplicates by id (first occurrence wins)", () => {
    const surface = buildMessageProductSurface([
      jsonEvent("search_products", [product("a"), product("b")], "completed", "e1"),
      jsonEvent("semantic_search_products", [product("b"), product("c")], "completed", "e2"),
    ]);

    expect(surface.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(surface.byId.size).toBe(3);
    expect(surface.overflowCount).toBe(0);
  });

  it("caps at 5 cards and reports overflow", () => {
    const many = Array.from({ length: 8 }, (_, i) => product(`p${i}`));
    const surface = buildMessageProductSurface([jsonEvent("search_products", many)]);

    expect(surface.cards).toHaveLength(5);
    expect(surface.cards.map((c) => c.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(surface.overflowCount).toBe(3);
    expect(surface.byId.size).toBe(8);
  });

  it("yields no products for a 'No products found' sentence", () => {
    const surface = buildMessageProductSurface([
      toolEvent("search_products", 'No products found matching "ghost".'),
    ]);

    expect(surface.cards).toHaveLength(0);
    expect(surface.byId.size).toBe(0);
    expect(surface.overflowCount).toBe(0);
  });

  it("parses a low-confidence semantic result emitted as separate prose + JSON parts", () => {
    // The prose nudge (which can itself contain "[", e.g. an echoed "[gaming]"
    // query) is its own content part, so it simply fails to parse and the JSON
    // part still yields the card — no bracket-scanning of prose required.
    const surface = buildMessageProductSurface([
      multiPartEvent("semantic_search_products", [
        'No product is a STRONG semantic match for "[gaming] monitor". Showing the closest item:',
        JSON.stringify([product("z")]),
      ]),
    ]);

    expect(surface.cards.map((c) => c.id)).toEqual(["z"]);
  });

  it("ignores failed events and non-search tools", () => {
    const surface = buildMessageProductSurface([
      jsonEvent("search_products", [product("a")], "failed"),
      jsonEvent("get_price_summary", [product("b")]),
      jsonEvent("search_products", [product("c")], "running"),
    ]);

    expect(surface.cards).toHaveLength(0);
    expect(surface.byId.size).toBe(0);
  });

  it("tolerates malformed JSON without throwing", () => {
    const surface = buildMessageProductSurface([toolEvent("search_products", "{not json")]);
    expect(surface.cards).toHaveLength(0);
  });

  it("returns an empty surface when there are no tool events", () => {
    const surface = buildMessageProductSurface([]);
    expect(surface).toEqual({ byId: new Map(), cards: [], overflowCount: 0 });
  });
});
