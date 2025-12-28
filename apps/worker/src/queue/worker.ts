import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "../config.js";
import priceCheckJob from "../jobs/priceCheck.js";

// Initialize BullMQ Worker
const worker = new Worker(QUEUE_NAME, priceCheckJob, { connection });

// Event listeners
worker.on("completed", (job) => {
  console.log(`[${job.id}] Completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[${job?.id}] Failed: ${err.message}`);
});

export default worker;
