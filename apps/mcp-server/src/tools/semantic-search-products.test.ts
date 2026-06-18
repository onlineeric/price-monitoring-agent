import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SemanticSearchResult } from "../embeddings/search";

/**
 * The semantic_search_products tool is a thin formatter over semanticSearch:
 * it maps rows to the documented output (incl. currentPriceFormatted via the
 * _format helper), emits a human note on empty results, and routes failures
 * through the shared _wrap.ts envelope. We mock semanticSearch and capture the
 * registered handler/metadata.
 */

const searchMock = vi.hoisted(() => ({ semanticSearch: vi.fn() }));
vi.mock("../embeddings/search.js", () => searchMock);

import { registerSemanticSearchProducts } from "./semantic-search-products";

type Handler = (args: { query: string; limit?: number }) => Promise<{
  isError?: boolean;
  content: { type: string; text: string }[];
}>;

type ToolMetadata = { description: string };

function captureHandler(): Handler {
  let captured: Handler | undefined;
  registerSemanticSearchProducts({
    registerTool: (_n: string, _m: unknown, h: Handler) => {
      captured = h;
    },
  } as unknown as Parameters<typeof registerSemanticSearchProducts>[0]);
  if (!captured) throw new Error("Handler not captured");
  return captured;
}

function captureMetadata(): ToolMetadata {
  let captured: ToolMetadata | undefined;
  registerSemanticSearchProducts({
    registerTool: (_n: string, m: ToolMetadata) => {
      captured = m;
    },
  } as unknown as Parameters<typeof registerSemanticSearchProducts>[0]);
  if (!captured) throw new Error("Metadata not captured");
  return captured;
}

const ROW: SemanticSearchResult = {
  id: "p1",
  name: "UltraView 27",
  url: "https://shop/ultraview-27",
  brand: "Acme",
  category: "Monitors",
  countryOfOrigin: "Taiwan",
  description: "A colour-accurate 27-inch display.",
  attributes: [{ key: "Refresh rate", value: "165 Hz" }],
  currentPriceCents: 58500,
  currency: "NZD",
  matchedChunk: "UltraView 27 — Acme (Monitors) colour-accurate panel",
  distance: 0.21,
  lowConfidence: false,
};

beforeEach(() => {
  searchMock.semanticSearch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("semantic_search_products tool", () => {
  it("steers the agent to keep price predicates out of the semantic query", () => {
    const metadata = captureMetadata();
    expect(metadata.description).toMatch(/meaning/i);
    expect(metadata.description.toLowerCase()).toContain("price");
  });

  it("returns a human note (no error) when nothing semantically matches", async () => {
    searchMock.semanticSearch.mockResolvedValueOnce([]);
    const handler = captureHandler();
    const result = await handler({ query: "hiking trail" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toBe('No products semantically match "hiking trail".');
  });

  it("maps matches to the documented shape incl. currentPriceFormatted", async () => {
    searchMock.semanticSearch.mockResolvedValueOnce([ROW]);
    const handler = captureHandler();
    const result = await handler({ query: "colour accurate monitor", limit: 3 });

    expect(searchMock.semanticSearch).toHaveBeenCalledWith("colour accurate monitor", 3);
    const parsed = JSON.parse(result.content[0]?.text ?? "[]") as Array<Record<string, unknown>>;
    expect(parsed[0]).toEqual({
      id: "p1",
      name: "UltraView 27",
      url: "https://shop/ultraview-27",
      brand: "Acme",
      category: "Monitors",
      countryOfOrigin: "Taiwan",
      description: "A colour-accurate 27-inch display.",
      attributes: [{ key: "Refresh rate", value: "165 Hz" }],
      currentPriceCents: 58500,
      currentPriceFormatted: "NZD 585.00",
      currency: "NZD",
      matchedChunk: "UltraView 27 — Acme (Monitors) colour-accurate panel",
      distance: 0.21,
      lowConfidence: false,
    });
  });

  it("flags a best-effort fallback row as low-confidence in a separate note part", async () => {
    searchMock.semanticSearch.mockResolvedValueOnce([{ ...ROW, distance: 0.81, lowConfidence: true }]);
    const handler = captureHandler();
    const result = await handler({ query: "host a big dinner party" });

    expect(result.isError).toBeFalsy();
    // Two parts: a human low-confidence note, then the machine JSON payload —
    // kept separate so the card extractor parses the JSON without scanning prose.
    expect(result.content).toHaveLength(2);
    expect(result.content[0]?.text).toMatch(/low.confidence/i);
    const parsed = JSON.parse(result.content[1]?.text ?? "[]") as Array<Record<string, unknown>>;
    expect(parsed[0]).toMatchObject({ id: "p1", lowConfidence: true });
  });

  it("routes failures through the _wrap.ts error envelope", async () => {
    searchMock.semanticSearch.mockRejectedValueOnce(new Error("model boom"));
    const handler = captureHandler();
    const result = await handler({ query: "x" });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}") as { error?: { code: string; message: string } };
    expect(parsed.error?.code).toBe("INTERNAL_ERROR");
    expect(parsed.error?.message).toContain("model boom");
  });
});
