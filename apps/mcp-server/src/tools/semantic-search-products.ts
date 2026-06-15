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
      "Natural-language description of the kind of product you're looking for, matched by MEANING " +
        "against each product's metadata (name, brand, category, country, description, specs). " +
        "This is the SEMANTIC part only — do NOT put price predicates here (e.g. \"cheap\", \"under $200\"). " +
        "Route price/budget filtering to get_price_summary / search_products instead.",
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }),
  );
}
