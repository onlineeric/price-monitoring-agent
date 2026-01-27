import { type NextRequest, NextResponse } from "next/server";

import { db, products } from "@price-monitor/db";
import { eq } from "drizzle-orm";
import { validate as isValidUuid } from "uuid";

import { priceQueue } from "@/lib/queue";

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

    // Enqueue a check-price job with the product's URL
    const job = await priceQueue.add("check-price", {
      url: product.url,
      triggeredAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Price check job enqueued",
    });
  } catch (error) {
    console.error("[API] Error triggering price check:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to trigger price check",
      },
      { status: 500 },
    );
  }
}
