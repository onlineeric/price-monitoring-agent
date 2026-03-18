import { Job } from "bullmq";

import { buildActiveProductReportSnapshot, sendPriceReportEmail } from "@price-monitor/reporting";

import { closeUpdatePricesFlowProducer, enqueueRefreshFlowForActiveProducts } from "../services/update-prices.js";

export async function sendDigestJob(job: Job) {
  console.log(`[${job.id}] Starting digest flow...`);

  try {
    const triggerType = job.name === "send-digest-scheduled" ? "scheduled" : "manual";
    const refreshResult = await enqueueRefreshFlowForActiveProducts(triggerType);

    console.log(`[${job.id}] Found ${refreshResult.activeProductCount} active products`);

    if (!refreshResult.enqueued) {
      console.log(`[${job.id}] No products to check, skipping`);
      return { success: true, message: 'No products to check' };
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

    const report = await buildActiveProductReportSnapshot();

    // Send digest email
    const recipientEmail = process.env.ALERT_EMAIL || 'test@example.com';

    const sendResult = await sendPriceReportEmail({
      recipients: [recipientEmail],
      generatedAt: report.generatedAt,
      products: report.items,
    });

    if (sendResult.success) {
      console.log('[Digest Flow] Email sent successfully');
    } else {
      console.error('[Digest Flow] Failed to send email:', sendResult.errorMessage);
    }

    return { success: sendResult.success, productCount: report.items.length };
  } catch (error) {
    console.error('[Digest Flow] Error in completion callback:', error);
    throw error;
  }
}

export async function closeFlowProducer() {
  await closeUpdatePricesFlowProducer();
}
