import { NextResponse } from "next/server";
import { priceQueue } from "@/lib/queue";

/**
 * Request body interface for triggering a price check job
 */
interface TriggerBody {
  url: string; // Product URL to scrape
}

/**
 * Debug endpoint to trigger a price check job
 * Only requires URL - worker will lookup/create product record automatically
 */
export async function POST(request: Request) {
  const body: TriggerBody = await request.json().catch(() => ({} as TriggerBody));

  if (!body.url) {
    return NextResponse.json(
      { success: false, error: "URL is required" },
      { status: 400 }
    );
  }

  const job = await priceQueue.add("check-price", {
    url: body.url,
    triggeredAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    jobId: job.id,
    url: body.url,
    message: "Job enqueued - worker will lookup/create product automatically",
  });
}
