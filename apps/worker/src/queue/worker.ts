import { type Job, Worker } from "bullmq";
import { connection, QUEUE_NAME } from "../config.js";
import priceCheckJob from "../jobs/priceCheck.js";
import { onDigestFlowComplete, sendDigestJob } from "../jobs/sendDigest.js";
import updateProductInfoJob from "../jobs/updateProductInfo.js";

// Job processor function
async function processJob(job: Job) {
  switch (job.name) {
    case "check-price":
      return await priceCheckJob(job);

    case "update-product-info":
      return await updateProductInfoJob(job);

    case "send-digest":
    case "send-digest-scheduled":
      // Both manual and scheduled digest jobs use the same handler
      return await sendDigestJob(job);

    case "send-digest-flow":
      // This is the parent job created by FlowProducer
      // When it completes (all children done), trigger callback
      return await onDigestFlowComplete(job);

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}

// Initialize BullMQ Worker.
// autorun:false so startup can run pending DB migrations BEFORE this worker
// begins consuming jobs (see index.ts — worker.run() is called after migrate).
const worker = new Worker(QUEUE_NAME, processJob, { connection, autorun: false });

// Event listeners
worker.on("completed", (job) => {
  console.log(`[JOB COMPLETED] ${job.name} (${job.id})`);
});

worker.on("failed", (job, err) => {
  console.error("[JOB FAILED]", {
    jobId: job?.id,
    jobName: job?.name,
    error: err.message,
    // Only include stack in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

worker.on("active", (job) => {
  console.log(`[JOB ACTIVE] ${job.name} (${job.id})`);
});

export default worker;
