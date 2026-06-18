import { type NextRequest, NextResponse } from "next/server";

import { priceQueue } from "@/lib/queue";

// Note: Authentication intentionally removed in this phase.
// Proper authentication will be added app-wide in a future phase.

export async function POST(request: NextRequest) {
  try {
    // Optional refresh mode: "info" runs a full metadata+price refresh per
    // product before the email; anything else (including no body) is the
    // default price-only digest. Default-safe so existing callers are unchanged.
    let mode: "price" | "info" = "price";
    try {
      const body = await request.json();
      if (body?.mode === "info") {
        mode = "info";
      }
    } catch {
      // No / invalid JSON body — keep the price-only default.
    }

    // Enqueue digest job
    const job = await priceQueue.add("send-digest", {
      triggeredBy: "manual",
      triggeredAt: new Date().toISOString(),
      mode,
    });

    console.log("[API] Digest job enqueued:", job.id);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Digest email process started",
    });
  } catch (error) {
    console.error("[API] Error triggering digest:", error);
    return NextResponse.json({ error: "Failed to trigger digest" }, { status: 500 });
  }
}
