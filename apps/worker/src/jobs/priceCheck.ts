import type { Job } from "bullmq";

/**
 * Job processor for price check jobs.
 * Currently a stub that simulates processing time.
 */
export default async function priceCheckJob(job: Job): Promise<{ status: string }> {
  console.log(`[${job.id}] Processing...`);

  // Simulate scraping delay (1 second)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return { status: "success" };
}
