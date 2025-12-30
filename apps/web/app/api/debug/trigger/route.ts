import { NextResponse } from "next/server";
import { priceQueue } from "@/lib/queue";

/**
 * Request body interface for triggering a price check job
 */
interface TriggerBody {
  productId?: string;
  url?: string; // URL to scrape for testing
}

export async function POST(request: Request) {
  const body: TriggerBody = await request.json().catch(() => ({}));
  const productId = body.productId ?? "manual-test";
  const url = body.url; // Optional - if not provided, worker skips scraping

  const job = await priceQueue.add("check-price", {
    productId,
    url,
    triggeredAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    jobId: job.id,
    message: "Job enqueued",
  });
}
