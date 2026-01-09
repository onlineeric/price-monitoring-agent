import { Worker, Job } from "bullmq";
import { connection, QUEUE_NAME } from "../config.js";
import priceCheckJob from "../jobs/priceCheck.js";
import { sendDigestJob, onDigestFlowComplete, closeFlowProducer } from '../jobs/sendDigest.js';

// Job processor function
async function processJob(job: Job) {
  switch (job.name) {
    case 'check-price':
      return await priceCheckJob(job);

    case 'send-digest':
      return await sendDigestJob(job);

    case 'send-digest-flow':
      // This is the parent job created by FlowProducer
      // When it completes (all children done), trigger callback
      return await onDigestFlowComplete(job);

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}

// Initialize BullMQ Worker
const worker = new Worker(QUEUE_NAME, processJob, { connection });

// Event listeners
worker.on("completed", (job) => {
  console.log(`[${job.id}] Completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[${job?.id}] Failed: ${err.message}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down worker...');
  await worker.close();
  await closeFlowProducer();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default worker;
