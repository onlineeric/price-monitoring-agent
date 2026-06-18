import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, eq, products } from "@price-monitor/db";
import { z } from "zod";
import { getPriceQueue } from "../queue.js";
import { withErrorHandling } from "./_wrap.js";

const inputSchema = z.object({
  url: z.string().url().describe("Product page URL to start monitoring (http/https)"),
});

// Match the UI's add flow (apps/web POST /api/products): enqueue a full
// metadata+price refresh, NOT a price-only check. update-product-info extracts
// rich metadata (description/category/brand/specs), writes the first price, and
// best-effort enqueues a semantic-search reindex — so chat-added products start
// as enriched and searchable as UI-added ones. A plain check-price would leave
// metadata blank until the user clicked "Update product details".
const JOB_NAME = "update-product-info";

export function registerAddProduct(server: McpServer) {
  server.registerTool(
    "add_product",
    {
      title: "Add Product",
      description:
        "Start monitoring a product by URL. Creates an active product row (if new) and enqueues a product-info job; the worker fills in the title, image, first price AND rich metadata (description, category, brand, specs). Idempotent: if the URL is already being monitored, returns the existing product without re-enqueueing.",
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
        hint: "Metadata extraction runs on the AI tier and takes a few seconds. Call search_products with part of the product name shortly to confirm the title, price, and details were scraped.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }),
  );
}
