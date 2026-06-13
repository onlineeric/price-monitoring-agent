import { db, eq, products } from "@price-monitor/db";
import { FlowProducer } from "bullmq";

import { connection } from "../config.js";

let flowProducer: FlowProducer | null = null;

function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection,
    });
  }

  return flowProducer;
}

/**
 * Refresh mode for the digest flow:
 * - "price" (default): cheap price-only check per product (`check-price`)
 * - "info": full metadata + price per product (`update-product-info`, AI tier)
 */
export type RefreshMode = "price" | "info";

export async function enqueueRefreshFlowForActiveProducts(
  triggerType: "manual" | "scheduled",
  mode: RefreshMode = "price",
) {
  const activeProducts = await db.select().from(products).where(eq(products.active, true));

  if (activeProducts.length === 0) {
    return {
      enqueued: false,
      activeProductCount: 0,
    };
  }

  // mode selects which per-product job each child runs.
  const childJobName = mode === "info" ? "update-product-info" : "check-price";

  const childJobs = activeProducts.map((product) => ({
    name: childJobName,
    data: { url: product.url },
    queueName: "price-monitor-queue",
    // Without this, a single failed scrape leaves the parent stuck in
    // `waiting-children` forever and the digest email is never sent.
    opts: { ignoreDependencyOnFailure: true },
  }));

  await getFlowProducer().add({
    name: "send-digest-flow",
    queueName: "price-monitor-queue",
    data: { triggerType },
    children: childJobs,
  });

  return {
    enqueued: true,
    activeProductCount: activeProducts.length,
  };
}

export async function closeUpdatePricesFlowProducer() {
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }
}
