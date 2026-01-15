import { Queue } from "bullmq";
import "./queue/worker.js";
import { closeBrowser } from "./services/scraper.js";
import { connection, QUEUE_NAME } from "./config.js";
import { DigestScheduler } from "./scheduler.js";

console.log("🚀 Worker Service is running and listening on queue...");

// Initialize digest scheduler if enabled
// IMPORTANT: Only ONE worker instance should have ENABLE_SCHEDULER=true
// Multiple scheduler instances would create duplicate scheduled jobs
const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER === 'true';
let scheduler: DigestScheduler | null = null;

if (ENABLE_SCHEDULER) {
  console.log("📅 Scheduler enabled (ENABLE_SCHEDULER=true)");

  // Create Queue instance for scheduler
  // Note: Worker already consumes jobs, this Queue is just for scheduling
  const queue = new Queue(QUEUE_NAME, { connection });

  // Initialize and start scheduler
  scheduler = new DigestScheduler(queue);
  scheduler.start().catch((error) => {
    console.error("❌ Failed to start scheduler:", error);
    process.exit(1);
  });
} else {
  console.log("⏭️  Scheduler disabled (ENABLE_SCHEDULER not set to 'true')");
  console.log("   This worker will process jobs but not manage scheduling.");
}

// Graceful shutdown handlers
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop scheduler if running
  if (scheduler) {
    await scheduler.stop();
  }

  // Close browser
  await closeBrowser();

  console.log("✅ Shutdown complete. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
