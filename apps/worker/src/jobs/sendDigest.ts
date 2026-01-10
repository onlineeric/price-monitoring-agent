import { Job, FlowProducer } from 'bullmq';
import { db, products, eq } from '@price-monitor/db';
import { connection } from '../config.js';
import { calculateTrendsForAllProducts } from '../services/trendCalculator.js';
import { sendDigestEmail } from '../services/emailService.js';

let flowProducer: FlowProducer | null = null;

function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: connection,
    });
  }
  return flowProducer;
}

export async function sendDigestJob(job: Job) {
  console.log(`[${job.id}] Starting digest flow...`);

  try {
    // Get all active products
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.active, true));

    console.log(`[${job.id}] Found ${allProducts.length} active products`);

    if (allProducts.length === 0) {
      console.log(`[${job.id}] No products to check, skipping`);
      return { success: true, message: 'No products to check' };
    }

    // Create child jobs for each product (price checks)
    const flow = getFlowProducer();

    const childJobs = allProducts.map((product) => ({
      name: 'check-price',
      data: { url: product.url },
      queueName: 'price-monitor-queue',
    }));

    // Create flow with parent-child relationship
    await flow.add({
      name: 'send-digest-flow',
      queueName: 'price-monitor-queue',
      data: { triggerType: 'manual' },
      children: childJobs,
    });

    console.log(`[${job.id}] Created flow with ${childJobs.length} child jobs`);

    // Note: The actual email sending happens in the completion callback
    // This job just sets up the flow
    return {
      success: true,
      message: `Enqueued ${childJobs.length} price check jobs`,
    };
  } catch (error) {
    console.error(`[${job.id}] Error setting up digest flow:`, error);
    throw error;
  }
}

export async function onDigestFlowComplete(job: Job, token?: string) {
  console.log(`[Digest Flow] All child jobs completed, sending email...`);

  try {
    // Verify children completed (defensive check)
    const childrenValues = await job.getChildrenValues();
    console.log(`[Digest Flow] Verified ${Object.keys(childrenValues).length} children completed`);

    // Calculate trends for all products
    const trends = await calculateTrendsForAllProducts();

    // Transform to email format
    const emailData = trends.map((trend) => ({
      name: trend.name,
      url: trend.url,
      imageUrl: trend.imageUrl,
      currentPrice: trend.currentPrice,
      currency: trend.currency,
      lastChecked: trend.lastChecked,
      lastFailed: trend.lastFailed,
      vsLastCheck: trend.vsLastCheck,
      vs7dAvg: trend.vs7dAvg,
      vs30dAvg: trend.vs30dAvg,
      vs90dAvg: trend.vs90dAvg,
      vs180dAvg: trend.vs180dAvg,
    }));

    // Send digest email
    const recipientEmail = process.env.ALERT_EMAIL || 'test@example.com';

    const success = await sendDigestEmail({
      to: recipientEmail,
      products: emailData,
    });

    if (success) {
      console.log('[Digest Flow] Email sent successfully');
    } else {
      console.error('[Digest Flow] Failed to send email');
    }

    return { success, productCount: trends.length };
  } catch (error) {
    console.error('[Digest Flow] Error in completion callback:', error);
    throw error;
  }
}

export async function closeFlowProducer() {
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }
}
