import { createServer } from "node:http";
import { createRequire } from "node:module";
import { db, sql } from "@price-monitor/db";
import { connection } from "./config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const PORT = Number.parseInt(process.env.WORKER_PORT || "3001", 10);

interface HealthResult {
  status: string;
  redis: string;
  database: string;
  error?: string;
}

async function checkHealth(): Promise<HealthResult> {
  const result: HealthResult = {
    status: "ok",
    redis: "ok",
    database: "ok",
  };
  const errors: string[] = [];

  // Check Redis
  try {
    await connection.ping();
  } catch (error) {
    result.redis = "error";
    errors.push(`Redis: ${error instanceof Error ? error.message : "connection failed"}`);
  }

  // Check Database
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    result.database = "error";
    errors.push(`Database: ${error instanceof Error ? error.message : "connection failed"}`);
  }

  if (errors.length > 0) {
    result.status = "error";
    result.error = errors.join("; ");
  }

  return result;
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health" && req.method === "GET") {
    const health = await checkHealth();
    const statusCode = health.status === "ok" ? 200 : 503;
    res.writeHead(statusCode);
    res.end(
      JSON.stringify({
        ...health,
        version: pkg.version,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

export function startServer() {
  server.listen(PORT, () => {
    console.log(`[SERVER] Health server listening on port ${PORT}`);
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => {
      console.log("[SERVER] Health server closed");
      resolve();
    });
  });
}
