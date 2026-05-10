import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, priceRecords, products } from "@price-monitor/db";
import { desc, ilike } from "drizzle-orm";
import { z } from "zod";
import { formatPriceCents } from "./_format.js";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  query: z.string().describe("Search term to match against product names (case-insensitive)"),
});

const MAX_RESULTS = 20;

export function registerSearchProducts(server: McpServer) {
  server.registerTool(
    "search_products",
    {
      title: "Search Products",
      description:
        "Search for monitored products by name. Returns matching products with their latest price. " +
        "`currentPriceCents` is the raw integer cents from the DB; `currentPriceFormatted` is the display string (e.g. \"NZD 585.00\") — show that to the user verbatim and do not divide cents yourself.",
      inputSchema,
    },
    withErrorHandling("search_products", async ({ query }) => {
      const matched = await db.query.products.findMany({
        where: ilike(products.name, `%${query}%`),
        columns: { id: true, name: true, url: true },
        with: {
          priceRecords: {
            limit: 1,
            orderBy: [desc(priceRecords.scrapedAt)],
            columns: { price: true, currency: true },
          },
        },
        limit: MAX_RESULTS,
      });

      if (matched.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No products found matching "${query}".` }],
        };
      }

      const results = matched.map((p) => {
        const latest = p.priceRecords[0];
        const cents = latest?.price ?? null;
        const currency = latest?.currency ?? null;
        return {
          id: p.id,
          name: p.name,
          url: p.url,
          currentPriceCents: cents,
          currentPriceFormatted: formatPriceCents(cents, currency),
          currency,
        };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }),
  );
}
