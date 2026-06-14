import { type NextRequest, NextResponse } from "next/server";

import { db, products } from "@price-monitor/db";
import { eq } from "drizzle-orm";
import { validate as isValidUuid } from "uuid";

import { priceQueue, priceQueueEvents } from "@/lib/queue";

/**
 * How long the request waits for the worker to finish before giving up and
 * telling the client the job is still processing. Rendering (Playwright) + AI
 * extraction is typically ~3-6s; this leaves generous headroom for a slow page.
 */
const JOB_WAIT_TIMEOUT_MS = 45_000;

/** Shape the worker returns on a successful run (see updateProductInfoJob). */
function isSuccessResult(value: unknown): value is { success: true } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: unknown }).success === true;
}

/** Pull a human-readable error off the worker's returned failure object, if any. */
function resultErrorMessage(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error: unknown }).error;
    if (typeof error === "string") return error;
  }
  return null;
}

/**
 * POST /api/products/[id]/update-info
 *
 * Triggers a full metadata + price refresh for one product, then WAITS for the
 * worker to finish so the client can refresh real (not stale) data. The worker
 * job has three outcomes, surfaced here via BullMQ's `waitUntilFinished`:
 *   - resolves with `{ success: true }`  → extraction completed       (200)
 *   - resolves with `{ success: false }` → extraction failed cleanly  (422)
 *   - rejects                            → job threw (no price/DB err) (422)
 * If extraction exceeds JOB_WAIT_TIMEOUT_MS the wait rejects with a "timed out"
 * error; the job keeps running in the background and we return 202 "processing".
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

    // Wait for the worker so the client refreshes only once the data is written.
    try {
      const result = await job.waitUntilFinished(priceQueueEvents, JOB_WAIT_TIMEOUT_MS);

      if (isSuccessResult(result)) {
        return NextResponse.json({ success: true, status: "completed", jobId: job.id });
      }

      // Resolved but not a success → the worker returned a clean failure (e.g.
      // page unreachable). Surface its message so the user knows why.
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: resultErrorMessage(result) ?? "Product info update did not complete successfully",
        },
        { status: 422 },
      );
    } catch (waitError) {
      const message = waitError instanceof Error ? waitError.message : String(waitError);

      // Timeout: the job is still running; don't treat it as a failure.
      if (/timed out/i.test(message)) {
        return NextResponse.json(
          {
            success: true,
            status: "processing",
            jobId: job.id,
            message: "Still processing — it will finish in the background.",
          },
          { status: 202 },
        );
      }

      // The job threw (no usable price, or a DB error) → real failure.
      return NextResponse.json({ success: false, status: "failed", error: message }, { status: 422 });
    }
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
