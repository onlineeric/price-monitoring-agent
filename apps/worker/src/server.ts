import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const PORT = Number.parseInt(process.env.WORKER_PORT || "3001", 10);

const server = createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", version: pkg.version }));
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
    server.close(() => {
      console.log("[SERVER] Health server closed");
      resolve();
    });
  });
}
