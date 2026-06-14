import { SETTING_LAST_BULK_REFRESH_COMPLETED_AT } from "@price-monitor/db";
import { buildActiveProductReportSnapshot, sendPriceReportEmail } from "@price-monitor/reporting";
import type { Job } from "bullmq";

import { setSetting } from "../services/settingsService.js";
import { closeUpdatePricesFlowProducer, enqueueRefreshFlowForActiveProducts } from "../services/update-prices.js";

/**
 * Stamp the "bulk refresh finished" marker so the dashboard can reveal a
 * "refresh available" signal once a batch it triggered has completed (B1).
 * Best-effort: a marker write must never fail the digest itself.
 */
async function stampBulkRefreshComplete(): Promise<void> {
  try {
    await setSetting(SETTING_LAST_BULK_REFRESH_COMPLETED_AT, new Date().toISOString());
  } catch (error) {
    console.error("[Digest] Failed to stamp bulk-refresh completion marker:", error);
  }
}

export async function sendDigestJob(job: Job) {
  console.log(`[${job.id}] Starting digest flow...`);

  try {
    const triggerType = job.name === "send-digest-scheduled" ? "scheduled" : "manual";
    // Refresh mode rides on the job payload. Scheduled digests carry none, so
    // they default to the cheap price-only refresh (SC-002).
    const mode = job.data?.mode === "info" ? "info" : "price";
    const refreshResult = await enqueueRefreshFlowForActiveProducts(triggerType, mode);

    console.log(`[${job.id}] Found ${refreshResult.activeProductCount} active products`);

    if (!refreshResult.enqueued) {
      console.log(`[${job.id}] No products to check, skipping`);
      // No flow → onDigestFlowComplete never runs, so mark "done" here, else a
      // dashboard waiting on the completion signal would poll until it times out.
      await stampBulkRefreshComplete();
      return { success: true, message: "No products to check" };
    }

    console.log(`[${job.id}] Created flow with ${refreshResult.activeProductCount} child jobs`);

    // Note: The actual email sending happens in the completion callback
    // This job just sets up the flow
    return {
      success: true,
      message: `Enqueued ${refreshResult.activeProductCount} price check jobs`,
    };
  } catch (error) {
    console.error(`[${job.id}] Error setting up digest flow:`, error);
    throw error;
  }
}

export async function onDigestFlowComplete(job: Job, token?: string) {
  void token;
  console.log(`[Digest Flow] All child jobs completed, sending email...`);

  try {
    // Verify children completed (defensive check)
    const childrenValues = await job.getChildrenValues();
    console.log(`[Digest Flow] Verified ${Object.keys(childrenValues).length} children completed`);

    // All products are refreshed by this point — stamp the marker before the
    // email so the dashboard sees "done" even if email delivery later fails.
    await stampBulkRefreshComplete();

    const report = await buildActiveProductReportSnapshot();

    // Send digest email
    const recipientEmail = process.env.ALERT_EMAIL || "test@example.com";

    const sendResult = await sendPriceReportEmail({
      recipients: [recipientEmail],
      generatedAt: report.generatedAt,
      products: report.items,
    });

    if (sendResult.success) {
      console.log("[Digest Flow] Email sent successfully");
    } else {
      console.error("[Digest Flow] Failed to send email:", sendResult.errorMessage);
    }

    return { success: sendResult.success, productCount: report.items.length };
  } catch (error) {
    console.error("[Digest Flow] Error in completion callback:", error);
    throw error;
  }
}

export async function closeFlowProducer() {
  await closeUpdatePricesFlowProducer();
}
