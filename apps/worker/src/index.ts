import "./queue/worker.js";
import { closeBrowser } from "./services/scraper.js";

console.log("🚀 Worker Service is running and listening on queue...");

// Graceful shutdown handlers
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await closeBrowser();
  console.log("Browser closed. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
