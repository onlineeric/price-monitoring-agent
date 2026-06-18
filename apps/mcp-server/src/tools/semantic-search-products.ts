import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { semanticSearch } from "../embeddings/search.js";
import { formatPriceCents } from "./_format.js";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "A SHORT, product-shaped phrase describing the KIND of product wanted, matched by MEANING " +
        "against each product's metadata (name, brand, category, country, description, specs). " +
        "Distill the user's request down to the product essence — pass the noun phrase, not their full " +
        "situational narrative. E.g. for \"I'm hosting a dinner party for lots of guests, suggest some " +
        "drinks to buy, no budget limit\" pass \"wine and party drinks\", NOT the whole sentence: " +
        "occasion/quantity/budget words (host, guests, suggestions, no budget) dilute the match and can " +
        "drop the right product. Likewise do NOT put price predicates here (e.g. \"cheap\", \"under $200\"); " +
        "route price/budget filtering to get_price_summary / search_products instead.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Optional max number of distinct products to return (1..50). Defaults to the server's configured top-N (5)."),
});

export function registerSemanticSearchProducts(server: McpServer) {
  server.registerTool(
    "semantic_search_products",
    {
      title: "Semantic Product Search",
      description:
        "Find monitored products whose metadata is closest in MEANING to a natural-language query — " +
        "use this when the user describes what they want rather than naming it (e.g. \"a monitor good for video editing\"). " +
        "For exact name lookups use search_products; for price/budget filtering use the price tools. " +
        "Returns distinct products nearest-first with rich metadata and `currentPriceFormatted` (a display string like " +
        "\"NZD 585.00\" — show it verbatim, never divide cents yourself). An off-topic query returns no products.",
      inputSchema,
    },
    withErrorHandling("semantic_search_products", async ({ query, limit }) => {
      const matches = await semanticSearch(query, limit);

      if (matches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No products semantically match "${query}".` }],
        };
      }

      const results = matches.map((m) => ({
        ...m,
        // Display string ("NZD 585.00") the agent must show verbatim.
        currentPriceFormatted: formatPriceCents(m.currentPriceCents, m.currency),
      }));

      const json = JSON.stringify(results, null, 2);
      // Fallback rows (no chunk cleared the confident cutoff): the agent should
      // present the closest item tentatively rather than as a strong match. Emit
      // the human nudge as its OWN content part, kept separate from the machine
      // JSON, so the card extractor parses the JSON part cleanly instead of
      // string-scanning prose for the array boundary. The model still reads both.
      const lowConfidence = matches.every((m) => m.lowConfidence);
      const content = lowConfidence
        ? [
            {
              type: "text" as const,
              text:
                `No product is a STRONG semantic match for "${query}". Showing the single closest item as a ` +
                "LOW-CONFIDENCE suggestion — tell the user it may not be a great fit and don't overstate it.",
            },
            { type: "text" as const, text: json },
          ]
        : [{ type: "text" as const, text: json }];

      return { content };
    }),
  );
}
