import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ServerConfig } from "../config.js";
import { createServer as buildMcpServer } from "../server.js";

/**
 * Build a stateless `StreamableHTTPServerTransport`.
 *
 * The SDK's typed options declare `sessionIdGenerator?: () => string`, but
 * the SDK example explicitly passes `undefined` to opt into stateless
 * mode. Under our `exactOptionalPropertyTypes: true` tsconfig, passing
 * `undefined` to an optional `() => string` is a type error — so we cast
 * the literal `undefined` to satisfy the signature while preserving the
 * SDK-documented behavior.
 */
function buildStatelessTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined as unknown as () => string,
    enableJsonResponse: true,
  });
}

/**
 * Helper around `mcpServer.connect(transport)` that satisfies our strict
 * `exactOptionalPropertyTypes`. The SDK's `Transport` type declares its
 * lifecycle handlers (`onclose`, `onerror`, `onmessage`) as required
 * `() => void` but the implementations expose them as the wider
 * `(() => void) | undefined`. The cast preserves runtime behavior.
 */
async function connectTransport(mcpServer: McpServer, transport: StreamableHTTPServerTransport): Promise<void> {
  await mcpServer.connect(transport as unknown as Parameters<typeof mcpServer.connect>[0]);
}

/**
 * Run the MCP server over HTTP.
 *
 * Layout:
 *   1. Stand up a `node:http` server (no framework — FR-015) with a tiny
 *      router for the two documented endpoints (`POST /mcp`, `GET /health`).
 *   2. Per `POST /mcp`: build a fresh `McpServer` + `StreamableHTTPServer
 *      Transport({ sessionIdGenerator: undefined })` and call
 *      `transport.handleRequest(req, res, parsedBody)`. This is the
 *      SDK-documented pattern for stateless mode (see SDK example
 *      `simpleStatelessStreamableHttp.js`) — sharing one transport across
 *      requests in stateless mode produces "stream is closed" errors on
 *      the second request and would also let concurrent requests collide
 *      (FR-014). The pre-006 plan called for a single shared transport;
 *      empirical SDK behavior required this deviation.
 *   3. Per-request: enforce a 30 s timeout (FR-011a), emit one access-log
 *      line on `finish` (FR-013a). Bodies and tool args are NOT logged
 *      (NFR-003).
 *   4. Register SIGTERM / SIGINT handlers (FR-011 / FR-012). On signal:
 *      stop accepting new connections, close all idle keep-alive sockets
 *      (Node 18+ `closeIdleConnections`), and force-exit after the 10 s
 *      grace window if drain stalls.
 *
 * `enableJsonResponse: true` is set on the per-request transport so the
 * response body is a plain JSON-RPC frame (Content-Type: application/json)
 * rather than an SSE stream. The project's tools never push server-side
 * notifications, so the SSE machinery would buy nothing and would force
 * every consumer to handle two response shapes.
 */
export async function runHttp(_unusedServer: McpServer, config: ServerConfig): Promise<void> {
  const startedAtMs = Date.now();
  let shuttingDown = false;
  let forceExitTimer: NodeJS.Timeout | null = null;

  const httpServer: HttpServer = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      // Defensive: if the router itself throws and the response has not been
      // sent, emit a 500. Log the error (NFR-003: no full stack).
      console.error(`[mcp-server] http handler error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Internal Server Error");
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? "/";

    // GET /health (orchestrator probes) and GET /mcp/health (web app probes
    // that build the URL by appending `/health` to the documented
    // `MCP_HTTP_URL=http://host:port/mcp`). Both are server-owned and NOT
    // delegated to the SDK.
    if (path === "/health" || path === "/mcp/health") {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Method Not Allowed");
        return;
      }
      const body = JSON.stringify({
        status: "ok",
        uptime: (Date.now() - startedAtMs) / 1000,
        version: config.version,
        transport: "http" as const,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(body);
      return;
    }

    // /mcp — delegate to the SDK for everything except POST body parsing.
    if (path === "/mcp") {
      if (shuttingDown) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Server shutting down");
        return;
      }
      if (req.method === "POST") {
        await handleMcpPost(req, res);
        return;
      }
      // Decision 7: do NOT pre-intercept GET / DELETE / etc. on /mcp —
      // delegate to the SDK so future SDK behavior changes stay
      // authoritative. The SDK answers with the protocol-correct shape
      // for stateless mode.
      const transport = buildStatelessTransport();
      const mcpServer = buildMcpServer();
      await connectTransport(mcpServer, transport);
      try {
        await transport.handleRequest(req, res);
      } finally {
        // Best-effort cleanup; SDK closes the transport on its own when the
        // request ends, but explicit close avoids relying on that.
        await transport.close().catch(() => undefined);
        await mcpServer.close().catch(() => undefined);
      }
      return;
    }

    // Anything else — 404.
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
  }

  async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTs = Date.now();
    let parsed: unknown;
    let parseFailed = false;
    let bodyTooLarge = false;
    // Track the per-request transport+server so the timeout callback can
    // tear them down. This unwinds `transport.handleRequest`'s awaited
    // promise so the in-flight tool work releases its connection-pool slot
    // instead of accumulating zombie operations (FR-011a "MUST abort it").
    let transport: StreamableHTTPServerTransport | null = null;
    let mcpServer: McpServer | null = null;
    const abortController = new AbortController();

    // Per-request timeout (FR-011a): a JS-level `setTimeout` rather than
    // `req.setTimeout()`. The socket-level `req.setTimeout` triggers Node's
    // default socket-destroy behavior alongside the user callback, so the
    // 504 response often loses to the socket teardown and clients see
    // "other side closed". A plain timer lets us write the structured
    // response cleanly, fires the AbortController, and tears down the SDK
    // transport so the awaited handler unwinds.
    const timeoutHandle = setTimeout(() => {
      if (!res.headersSent && !res.writableEnded) {
        const body = JSON.stringify({
          error: {
            code: "request_timeout",
            message: `MCP request exceeded ${config.requestTimeoutMs}ms timeout`,
          },
        });
        res.statusCode = 504;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(body);
      }
      abortController.abort();
      // Best-effort SDK teardown so `await transport.handleRequest(...)`
      // resolves promptly and the per-request resources are released.
      transport?.close().catch(() => undefined);
      mcpServer?.close().catch(() => undefined);
    }, config.requestTimeoutMs);
    res.on("close", () => clearTimeout(timeoutHandle));
    res.on("finish", () => clearTimeout(timeoutHandle));

    // Buffer the request body with a 1 MiB cap. Node's `http` has no default
    // body-size limit, so an unbounded accumulator is an OOM pathway. Tool
    // results in this project are well under 1 MiB; anything larger is a
    // misconfigured peer or hostile traffic.
    try {
      parsed = await readJsonBody(req, MAX_BODY_BYTES);
    } catch (err) {
      parseFailed = true;
      if (err instanceof BodyTooLargeError) bodyTooLarge = true;
    }

    // Access-log line (FR-013a) — wired up *before* delegating so it fires
    // even when the SDK throws or times out.
    res.on("finish", () => {
      const method = parseFailed ? "-" : extractJsonRpcMethod(parsed);
      const tool = parseFailed ? "-" : extractToolName(parsed);
      const ms = Date.now() - startTs;
      console.error(`[mcp-server] http POST /mcp method=${method} tool=${tool} status=${res.statusCode} ms=${ms}`);
    });
    res.on("close", () => {
      // If the client disconnected before `finish` (e.g., timeout destroyed
      // the socket), still emit a log line so operators can see the failure.
      if (!res.writableFinished) {
        const method = parseFailed ? "-" : extractJsonRpcMethod(parsed);
        const tool = parseFailed ? "-" : extractToolName(parsed);
        const ms = Date.now() - startTs;
        console.error(
          `[mcp-server] http POST /mcp method=${method} tool=${tool} status=${res.statusCode} ms=${ms} (closed)`,
        );
      }
    });

    if (parseFailed) {
      if (res.headersSent || res.writableEnded) return;
      if (bodyTooLarge) {
        res.statusCode = 413;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Request body too large");
      } else {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Invalid JSON-RPC body");
      }
      return;
    }

    // Stateless mode: build a fresh transport + McpServer per request
    // (SDK-documented pattern). Tool registration is cheap — it just
    // populates an in-memory registry — so the per-request cost is small.
    transport = buildStatelessTransport();
    mcpServer = buildMcpServer();
    await connectTransport(mcpServer, transport);
    // If the timeout fired while we were waiting on the body, the request
    // is already closed — skip the SDK call so we don't hand a fresh
    // transport an already-ended response.
    if (abortController.signal.aborted) {
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
      return;
    }
    try {
      await transport.handleRequest(req, res, parsed);
    } finally {
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
    }
  }

  // --- Bind ---
  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      // EADDRINUSE is the operationally meaningful failure here. Fail fast
      // with a clear message naming the port and the code (FR-009).
      console.error(
        `[mcp-server] FATAL: failed to bind ${config.httpHost}:${config.httpPort} — ${err.code ?? err.message}`,
      );
      reject(err);
    };
    httpServer.once("error", onError);
    httpServer.listen(config.httpPort, config.httpHost, () => {
      httpServer.removeListener("error", onError);
      console.error(`[mcp-server] price-monitor-mcp-server ready on http :${config.httpPort}`);
      resolve();
    });
  });

  // After successful bind, install a long-lived error listener so the
  // process logs (and exits) on later listener failures rather than
  // crashing silently.
  httpServer.on("error", (err) => {
    console.error(`[mcp-server] http server error: ${err.message}`);
  });

  // --- Graceful shutdown ---
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[mcp-server] shutting down (signal=${signal})`);

    // Re-close idle connections on every tick of the drain so a client
    // that keeps a keep-alive socket open (e.g., undici's connection
    // pool) cannot block `httpServer.close()` from firing its callback.
    // In-flight requests still finish — only the *idle* sockets are
    // released.
    const idleSweep = setInterval(() => {
      if (typeof httpServer.closeIdleConnections === "function") {
        httpServer.closeIdleConnections();
      }
    }, 50);

    httpServer.close(() => {
      // Drain finished cleanly within the grace window.
      clearInterval(idleSweep);
      if (forceExitTimer) {
        clearTimeout(forceExitTimer);
        forceExitTimer = null;
      }
      process.exit(0);
    });
    // First sweep happens immediately so the common case (no in-flight
    // work) exits in well under 50 ms.
    if (typeof httpServer.closeIdleConnections === "function") {
      httpServer.closeIdleConnections();
    }

    forceExitTimer = setTimeout(() => {
      console.error(`[mcp-server] grace period (${config.gracePeriodMs}ms) elapsed — forcing exit`);
      clearInterval(idleSweep);
      // Active sockets may still be holding the loop open — close them
      // too so the exit actually fires.
      if (typeof httpServer.closeAllConnections === "function") {
        httpServer.closeAllConnections();
      }
      process.exit(0);
    }, config.gracePeriodMs);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Run forever. The function returns only when the process exits via the
  // shutdown handler.
  await new Promise<void>(() => undefined);
}

// 1 MiB cap on POST /mcp request bodies. Tool inputs are JSON-RPC frames
// listing tool names and small argument objects; nothing legitimate
// approaches this. Without a cap, `data += chunk` is an OOM pathway.
const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`request body exceeded ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > maxBytes) {
        req.destroy();
        reject(new BodyTooLargeError(maxBytes));
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      // Empty body is treated as parse failure — the SDK demands a frame.
      if (data.length === 0) {
        reject(new SyntaxError("empty body"));
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function extractJsonRpcMethod(body: unknown): string {
  if (body && typeof body === "object" && "method" in body) {
    const m = (body as { method?: unknown }).method;
    if (typeof m === "string") return m;
  }
  return "-";
}

function extractToolName(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "method" in body &&
    (body as { method?: unknown }).method === "tools/call" &&
    "params" in body
  ) {
    const params = (body as { params?: unknown }).params;
    if (params && typeof params === "object" && "name" in params) {
      const name = (params as { name?: unknown }).name;
      if (typeof name === "string") return name;
    }
  }
  return "-";
}
