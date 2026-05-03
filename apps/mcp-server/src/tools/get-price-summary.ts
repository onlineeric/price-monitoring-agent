import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, priceRecords } from "@price-monitor/db";
import { subDays } from "date-fns";
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  productId: z.string().uuid().describe("The product ID to summarize"),
  days: z.number().int().min(1).max(365).optional().describe("Window size in days (default 30, max 365)"),
});

const DEFAULT_DAYS = 30;
const TREND_THRESHOLD = 0.03; // 3% change between window halves counts as a trend

type Trend = "up" | "down" | "stable";

function average(prices: number[]): number {
  const sum = prices.reduce((acc, p) => acc + p, 0);
  return Math.round(sum / prices.length);
}

function computeTrend(pricesAscending: number[]): Trend {
  if (pricesAscending.length < 2) return "stable";
  const mid = Math.floor(pricesAscending.length / 2);
  const firstHalfAvg = average(pricesAscending.slice(0, mid));
  const secondHalfAvg = average(pricesAscending.slice(mid));
  const delta = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  if (delta > TREND_THRESHOLD) return "up";
  if (delta < -TREND_THRESHOLD) return "down";
  return "stable";
}

export function registerGetPriceSummary(server: McpServer) {
  server.registerTool(
    "get_price_summary",
    {
      title: "Get Price Summary",
      description:
        "Summarize a product's price over a window of days: current, min, max, average, trend direction, and sample count.",
      inputSchema,
    },
    withErrorHandling("get_price_summary", async ({ productId, days }) => {
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
        .orderBy(asc(priceRecords.scrapedAt));

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

      const latest = records[records.length - 1];
      if (!latest) {
        throw new Error("Unreachable: records array is non-empty per guard above");
      }
      const prices = records.map((r) => r.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = average(prices);
      const trend = computeTrend(prices);

      const summary = {
        productId,
        windowDays,
        current: latest.price,
        min,
        max,
        avg,
        trend,
        sampleCount: records.length,
        currency: latest.currency,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }),
  );
}
