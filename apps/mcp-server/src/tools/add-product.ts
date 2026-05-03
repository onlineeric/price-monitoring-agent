import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, eq, products } from "@price-monitor/db";
import { z } from "zod";
import { getPriceQueue } from "../queue.js";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  url: z.string().url().describe("Product page URL to start monitoring (http/https)"),
});

const JOB_NAME = "check-price";

export function registerAddProduct(server: McpServer) {
  server.registerTool(
    "add_product",
    {
      title: "Add Product",
      description:
        "Start monitoring a product by URL. Creates an active product row (if new) and enqueues a price check job; the worker fills in the title and first price. Idempotent: if the URL is already being monitored, returns the existing product without re-enqueueing.",
      inputSchema,
    },
    withErrorHandling("add_product", async ({ url }) => {
      // Atomic insert-if-absent. Match the UI's add flow: new rows start active
      // so the scheduled digest picks them up. Falling back to the worker's
      // getOrCreateProductByUrl would create inactive rows (its default exists
      // for the legacy/race-condition path, not for user-initiated adds).
      const [inserted] = await db
        .insert(products)
        .values({ url, active: true })
        .onConflictDoNothing({ target: products.url })
        .returning({ id: products.id });

      if (!inserted) {
        const [existing] = await db
          .select({ id: products.id, name: products.name, active: products.active })
          .from(products)
          .where(eq(products.url, url))
          .limit(1);

        const result = {
          status: "already_monitoring" as const,
          productId: existing?.id ?? null,
          name: existing?.name ?? null,
          active: existing?.active ?? null,
          url,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      const queue = getPriceQueue();
      const job = await queue.add(JOB_NAME, {
        url,
        triggeredAt: new Date(),
      });

      const result = {
        status: "queued" as const,
        productId: inserted.id,
        jobId: job.id,
        url,
        hint: "Call search_products with part of the product name in a few seconds to confirm the title and first price were scraped.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }),
  );
}
