// Load the monorepo's root .env BEFORE anything else. In stdio mode the
// JSON-RPC stream lives on stdout, so dotenv MUST be told to suppress its
// banner (`quiet: true`); in HTTP mode it doesn't matter, but keeping the
// flag consistent avoids surprises. In production (Coolify) the file does
// not exist and dotenv silently no-ops — container env wins.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../../.env"), quiet: true });

import { ConfigError, loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { runHttp } from "./transports/http.js";
import { runStdio } from "./transports/stdio.js";

// Top-level await is fine here: the package targets ESM (see package.json
// "type": "module") and is launched via `tsx`. The dispatcher's only job is
// to read config, build the McpServer, and hand off to the right transport.
//
// stdio uses the shared `createServer()` here once and connects it to the
// stdio transport. HTTP mode also calls `createServer()` so the dispatcher
// stays uniform, but `runHttp` builds a fresh server+transport per request
// internally — the SDK requires that for stateless mode (see http.ts).
try {
  const config = loadConfig();
  const server = createServer();

  if (config.transport === "stdio") {
    await runStdio(server, config);
  } else {
    await runHttp(server, config);
  }
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[mcp-server] FATAL: ${err.message}`);
  } else {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mcp-server] FATAL: ${message}`);
  }
  process.exit(1);
}
