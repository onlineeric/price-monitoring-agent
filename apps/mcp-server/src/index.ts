// MUST be first: sets DOTENV_CONFIG_QUIET=true before @price-monitor/db
// (transitively imported below) runs `dotenv.config()`. Without this, the
// dotenv banner lands on stdout and corrupts the stdio JSON-RPC stream
// (FR-002 / edge case "stdout pollution risk").
import "./silence-dotenv.js";
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
