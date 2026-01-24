import { Queue } from "bullmq";
import worker from "./queue/worker.js";
import { closeBrowser } from "./services/scraper.js";
import { closeFlowProducer } from "./jobs/sendDigest.js";
import { connection, QUEUE_NAME } from "./config.js";
import { DigestScheduler } from "./scheduler.js";
import { validateAndExit } from "./utils/validateEnv.js";

// ===================================
// Worker Startup
// ===================================
console.log("[WORKER] Starting Price Monitor Worker...");
console.log(`[WORKER] Environment: ${process.env.NODE_ENV || "development"}`);

// Validate environment variables before proceeding
validateAndExit();

console.log("[WORKER] Connected to Redis");
console.log("[WORKER] Listening for jobs on queue:", QUEUE_NAME);

// ===================================
// Scheduler Initialization
// ===================================
// IMPORTANT: Only ONE worker instance should have ENABLE_SCHEDULER=true
// Multiple scheduler instances would create duplicate scheduled jobs
const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER === "true";
let scheduler: DigestScheduler | null = null;

if (ENABLE_SCHEDULER) {
  console.log("[SCHEDULER] Scheduler enabled (ENABLE_SCHEDULER=true)");
  console.log("[SCHEDULER] Initializing digest scheduler...");

  // Create Queue instance for scheduler
  // Note: Worker already consumes jobs, this Queue is just for scheduling
  const queue = new Queue(QUEUE_NAME, { connection });

  // Initialize and start scheduler
  scheduler = new DigestScheduler(queue);
  scheduler.start().catch((error) => {
    console.error("[SCHEDULER] Failed to start scheduler:", error);
    process.exit(1);
  });
} else {
  console.log("[SCHEDULER] Scheduler disabled (ENABLE_SCHEDULER not set to 'true')");
  console.log("[SCHEDULER] This worker will process jobs but not manage scheduling.");
}

// ===================================
// Graceful Shutdown
// ===================================
let isShuttingDown = false;

async function shutdown(signal: string) {
  // Prevent duplicate shutdown calls
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n[WORKER] ${signal} received. Shutting down gracefully...`);

  // Stop scheduler if running
  if (scheduler) {
    console.log("[SCHEDULER] Stopping scheduler...");
    await scheduler.stop();
  }

  // Close worker
  console.log("[WORKER] Closing worker...");
  await worker.close();

  // Close flow producer
  console.log("[WORKER] Closing flow producer...");
  await closeFlowProducer();

  // Close browser
  console.log("[WORKER] Closing browser...");
  await closeBrowser();

  console.log("[WORKER] Shutdown complete. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
