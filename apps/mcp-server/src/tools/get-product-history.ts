import { z } from "zod";
import { db, priceRecords } from "@price-monitor/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { subDays } from "date-fns";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  productId: z.string().uuid().describe("The product ID to retrieve price history for"),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Number of past days to include (default 30, max 365)"),
});

const DEFAULT_DAYS = 30;

export function registerGetProductHistory(server: McpServer) {
  server.registerTool(
    "get_product_history",
    {
      title: "Get Product History",
      description:
        "Retrieve historical price records for a product, ordered by most recent first. Optionally filter by a date range in days.",
      inputSchema,
    },
    withErrorHandling("get_product_history", async ({ productId, days }) => {
      const windowDays = days ?? DEFAULT_DAYS;
      const since = subDays(new Date(), windowDays);

      const records = await db
        .select({
          price: priceRecords.price,
          currency: priceRecords.currency,
          scrapedAt: priceRecords.scrapedAt,
        })
        .from(priceRecords)
        .where(and(eq(priceRecords.productId, productId), gte(priceRecords.scrapedAt, since)))
        .orderBy(desc(priceRecords.scrapedAt));

      if (records.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No price records found for product ${productId} in the last ${windowDays} days.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ productId, days: windowDays, records }, null, 2),
          },
        ],
      };
    }),
  );
}
