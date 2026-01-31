import { createServer } from "node:http";
import { createRequire } from "node:module";
import { connection } from "./config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const PORT = Number.parseInt(process.env.WORKER_PORT || "3001", 10);

async function checkHealth(): Promise<{ status: string; error?: string }> {
  try {
    await connection.ping();
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Redis connection failed",
    };
  }
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
