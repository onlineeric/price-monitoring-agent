import { type NextRequest, NextResponse } from "next/server";

import { db, products } from "@price-monitor/db";
import { eq } from "drizzle-orm";
import { validate as isValidUuid } from "uuid";

import { priceQueue } from "@/lib/queue";

/**
 * POST /api/products/[id]/update-info
 *
 * Triggers a full metadata + price refresh for one product. Mirrors the
 * check-price route exactly, differing only in the job it enqueues
 * (update-product-info instead of check-price). The worker performs the
 * extraction asynchronously; this route does not wait for it.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!isValidUuid(id)) {
      return NextResponse.json({ success: false, error: "Invalid product ID" }, { status: 400 });
    }

    // Look up product by ID
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    // Enqueue an update-product-info job with the product's URL
    const job = await priceQueue.add("update-product-info", {
      url: product.url,
      triggeredAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Product info update enqueued",
    });
  } catch (error) {
    console.error("[API] Error triggering product info update:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to trigger product info update",
      },
      { status: 500 },
    );
  }
}
