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

export async function enqueueRefreshFlowForActiveProducts(triggerType: "manual" | "scheduled") {
  const activeProducts = await db.select().from(products).where(eq(products.active, true));

  if (activeProducts.length === 0) {
    return {
      enqueued: false,
      activeProductCount: 0,
    };
  }

  const childJobs = activeProducts.map((product) => ({
    name: "check-price",
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
