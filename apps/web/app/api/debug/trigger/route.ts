import { NextResponse } from "next/server";
import { priceQueue } from "@/lib/queue";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const productId = body.productId ?? "manual-test";

  const job = await priceQueue.add("check-price", {
    productId,
    triggeredAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    jobId: job.id,
    message: "Job enqueued",
  });
}
