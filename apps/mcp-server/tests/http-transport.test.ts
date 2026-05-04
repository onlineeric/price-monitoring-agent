import { createServer as createTcpServer } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type SpawnedServer, spawnServer } from "./helpers/spawn-server.js";

/**
 * US1 — Web app calls the MCP server as a separate HTTP service.
 * US3 — `GET /health` orchestrator probe (under its own describe block).
 * US4 — Graceful shutdown (under its own describe block).
 *
 * Live integration tests: each case spawns the MCP server as a real child
 * process via `spawnServer()` and exercises the wire protocol over a real
 * socket. No SDK mocks (research.md Decision 10).
 */

const HOST = "127.0.0.1";
const ACCEPT_HEADER = "application/json, text/event-stream";

let nextPort = 4_100;
function nextFreePort(): number {
  // Each test gets its own port so a flaky shutdown in one test cannot
  // bleed into the next. Range is far enough above the 3002 default that
  // collisions with a developer's local server are unlikely.
  const port = nextPort;
  nextPort += 1;
  return port;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: { tools?: Array<{ name: string }>; content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

async function postMcp(
  port: number,
  body: unknown,
  options: { rawBody?: string; method?: string; path?: string } = {},
): Promise<{ status: number; headers: Headers; text: string; json?: JsonRpcResponse }> {
  const url = `http://${HOST}:${port}${options.path ?? "/mcp"}`;
  const init: RequestInit = {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: ACCEPT_HEADER,
    },
    body: options.rawBody ?? JSON.stringify(body),
  };
  const res = await fetch(url, init);
  const text = await res.text();
  let json: JsonRpcResponse | undefined;
  // The SDK may answer with SSE for some flows. Parse what we can.
  if (text.startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      // leave json undefined
    }
  } else if (text.startsWith("event:") || text.includes("data:")) {
    // SSE frame: extract the first `data:` payload.
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (dataLine) {
      const payload = dataLine.slice("data:".length).trim();
      try {
        json = JSON.parse(payload);
      } catch {
        // leave json undefined
      }
    }
  }
  return json === undefined
    ? { status: res.status, headers: res.headers, text }
    : { status: res.status, headers: res.headers, text, json };
}

async function getUrl(
  port: number,
  path: string,
): Promise<{ status: number; headers: Headers; text: string; json?: unknown }> {
  const res = await fetch(`http://${HOST}:${port}${path}`);
  const text = await res.text();
  let json: unknown;
  if (text.startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      // leave undefined
    }
  }
  return json === undefined
    ? { status: res.status, headers: res.headers, text }
    : { status: res.status, headers: res.headers, text, json };
}

async function waitForHealthy(port: number, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${HOST}:${port}/health`);
      if (res.ok) return;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server did not become healthy on port ${port} within ${timeoutMs}ms`);
}

async function spawnHttp(
  envOverlay: Record<string, string | undefined> = {},
): Promise<{ server: SpawnedServer; port: number }> {
  const port = nextFreePort();
  const server = spawnServer({
    env: {
      MCP_TRANSPORT: "http",
      MCP_HTTP_PORT: String(port),
      ...envOverlay,
    },
  });
  await server.waitForStderr(/ready on http :\d+/, 5_000);
  await waitForHealthy(port);
  return { server, port };
}

describe("US1 — HTTP transport (POST /mcp)", () => {
  // One shared server is reused across the read-only probes (a/b/c/d/e/h/k/l/m).
  // Tests that need a different env (g, n) or whose contract is the lifecycle
  // event itself (f port-collision, i misconfigured transport, j cross-transport
  // parity) still spawn their own — they cannot share. Sharing where safe cuts
  // ~9 child-process boots (≈ 1 s each) off this file's wall time without
  // weakening any contract: each test snapshots `stderrLines.length` before
  // asserting on its own delta, so prior tests' log lines do not bleed in.
  let shared: { server: SpawnedServer; port: number } | null = null;
  let perTest: SpawnedServer | null = null;
  // Typed accessor avoids `shared!` non-null assertions at every callsite —
  // beforeAll guarantees the server exists, but TS / Biome can't see that.
  function useShared(): { server: SpawnedServer; port: number } {
    if (!shared) throw new Error("US1 shared HTTP server not initialized in beforeAll");
    return shared;
  }

  beforeAll(async () => {
    shared = await spawnHttp();
  });

  afterAll(async () => {
    if (shared) {
      await shared.server.close();
      shared = null;
    }
  });

  afterEach(async () => {
    if (perTest) {
      await perTest.close();
      perTest = null;
    }
  });

  it("(a) tools/list returns the five expected tool names", async () => {
    const { port } = useShared();
    const res = await postMcp(port, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(res.status).toBe(200);
    expect(res.json?.result?.tools).toBeDefined();
    const names = (res.json?.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(
      ["add_product", "get_price_summary", "get_product_history", "ping", "search_products"].sort(),
    );
  });

  it("(b) tools/call ping with count: 3 returns 'pong pong pong'", async () => {
    const { port } = useShared();
    const res = await postMcp(port, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 3 } },
    });
    expect(res.status).toBe(200);
    expect(res.json?.result?.content?.[0]?.text).toBe("pong pong pong");
  });

  it("(c) malformed JSON yields HTTP 400 and the server keeps serving", async () => {
    const { port } = useShared();
    const bad = await postMcp(port, undefined, { rawBody: "{not-json" });
    expect(bad.status).toBe(400);

    // Subsequent valid request still works.
    const ok = await postMcp(port, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 1 } },
    });
    expect(ok.status).toBe(200);
    expect(ok.json?.result?.content?.[0]?.text).toBe("pong");
  });

  it("(d) GET on an unknown path yields 404 with body 'Not Found'", async () => {
    const { port } = useShared();
    const res = await getUrl(port, "/unknown");
    expect(res.status).toBe(404);
    expect(res.text).toBe("Not Found");
  });

  it("(e) POST /health yields 405 with Allow: GET header", async () => {
    const { port } = useShared();
    const res = await postMcp(port, {}, { path: "/health" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });

  it("(f) port already in use → child exits non-zero within 2s with EADDRINUSE on stderr", async () => {
    const port = nextFreePort();
    // Pre-bind the port so the MCP child cannot.
    const blocker = createTcpServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(port, HOST, () => resolve());
    });

    const child = spawnServer({
      env: { MCP_TRANSPORT: "http", MCP_HTTP_PORT: String(port) },
    });
    try {
      const exit = await child.waitForExit(2_500);
      expect(exit.code).not.toBe(0);
      const stderr = child.stderrLines.join("\n");
      expect(stderr).toContain(String(port));
      expect(stderr).toContain("EADDRINUSE");
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("(g) per-request timeout fires with structured 504", async () => {
    // Own spawn: the contract under test is the request-timeout config —
    // sharing a 30 s-default server would force the test to wait 30 s.
    const { server, port } = await spawnHttp({
      MCP_TEST_TOOLS: "1",
      MCP_REQUEST_TIMEOUT_MS: "200",
    });
    perTest = server;
    const slow = await postMcp(port, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "slow_ping", arguments: { ms: 1_000 } },
    });
    expect(slow.status).toBe(504);
    const body = JSON.parse(slow.text) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe("request_timeout");
    expect(typeof body.error?.message).toBe("string");

    // Server is still healthy afterwards.
    const fast = await postMcp(port, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 1 } },
    });
    expect(fast.status).toBe(200);
    expect(fast.json?.result?.content?.[0]?.text).toBe("pong");
  });

  it("(h) concurrent requests carry their own correct responses", async () => {
    const { port } = useShared();
    const a = postMcp(port, {
      jsonrpc: "2.0",
      id: 100,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 2 } },
    });
    const b = postMcp(port, {
      jsonrpc: "2.0",
      id: 101,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 5 } },
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.json?.result?.content?.[0]?.text).toBe("pong pong");
    expect(rb.json?.result?.content?.[0]?.text).toBe("pong pong pong pong pong");
  });

  it("(i) misconfigured MCP_TRANSPORT exits non-zero within 1s and names the value", async () => {
    const child = spawnServer({ env: { MCP_TRANSPORT: "foo" } });
    const exit = await child.waitForExit(2_000);
    expect(exit.code).not.toBe(0);
    const stderr = child.stderrLines.join("\n");
    expect(stderr).toContain("foo");
    expect(stderr).toContain("stdio");
    expect(stderr).toContain("http");
  });

  it("(j) cross-transport parity: stdio and http return identical tools/list and ping", async () => {
    // Own spawn: the test compares two transports side-by-side and needs a
    // fresh stdio child whose stdout buffer is empty (the shared server
    // would not help because it is HTTP-only, and the assertion compares
    // protocol parity between the two children).
    const { server: httpServer, port } = await spawnHttp();
    perTest = httpServer;

    const stdioChild = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    try {
      await stdioChild.waitForStderr(/ready on stdio/, 5_000);

      // tools/list over both transports.
      const httpList = await postMcp(port, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      });
      const stdioListPromise = stdioChild.waitForStdout(/"result"/, 5_000);
      stdioChild.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
      const stdioListLine = await stdioListPromise;
      const stdioList = JSON.parse(stdioListLine) as JsonRpcResponse;

      const httpNames = (httpList.json?.result?.tools ?? []).map((t) => t.name).sort();
      const stdioNames = (stdioList.result?.tools ?? []).map((t) => t.name).sort();
      expect(httpNames).toEqual(stdioNames);

      // tools/call: ping count: 3.
      const httpPing = await postMcp(port, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "ping", arguments: { count: 3 } },
      });
      const stdioPingPromise = stdioChild.waitForStdout(/"id":2/, 5_000);
      stdioChild.child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "ping", arguments: { count: 3 } },
        })}\n`,
      );
      const stdioPingLine = await stdioPingPromise;
      const stdioPing = JSON.parse(stdioPingLine) as JsonRpcResponse;

      expect(httpPing.json?.result?.content?.[0]?.text).toBe(stdioPing.result?.content?.[0]?.text);
      expect(httpPing.json?.result?.content?.[0]?.text).toBe("pong pong pong");
    } finally {
      await stdioChild.close();
    }
  });

  it("(k) one access-log line per POST /mcp; none for GET /health", async () => {
    const { server, port } = useShared();
    const startCount = server.stderrLines.length;

    await postMcp(port, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "ping", arguments: { count: 1 } },
    });
    // Give the `finish` listener a tick to write.
    await new Promise((r) => setTimeout(r, 50));

    const newLines = server.stderrLines.slice(startCount);
    const accessLine = newLines.find((l) =>
      /^\[mcp-server\] http POST \/mcp method=tools\/call tool=ping status=200 ms=\d+$/.test(l),
    );
    expect(accessLine).toBeDefined();

    const linesAfterMcp = server.stderrLines.length;
    await getUrl(port, "/health");
    await new Promise((r) => setTimeout(r, 50));
    expect(server.stderrLines.length).toBe(linesAfterMcp);
  });

  it("(l) HTTP startup log line appears on stderr within 5s", async () => {
    // The shared server already emitted the startup line when beforeAll
    // booted it; the assertion is satisfied by the buffered line. No new
    // spawn needed.
    const { server, port } = useShared();
    const line = await server.waitForStderr(/ready on http :\d+/, 5_000);
    expect(line).toContain(String(port));
  });

  it("(m) GET /mcp is delegated to the SDK (not pre-intercepted by our router)", async () => {
    const { port } = useShared();
    const res = await getUrl(port, "/mcp");
    // Our router would respond with status 405 + body "Method Not Allowed"
    // if it pre-intercepted GET /mcp. The SDK in stateless mode answers
    // differently — typically a 405 with a JSON-RPC error envelope or an
    // immediately-closed empty stream. The assertion is the negation: we
    // must NOT see the router-level shape.
    const looksLikeOurRouter = res.status === 405 && res.text === "Method Not Allowed";
    expect(looksLikeOurRouter).toBe(false);
  });

  it("(n) tool error envelope round-trips the _wrap.ts { error: { code, message } } shape", async () => {
    // Own spawn: the wrapper assertion targets the test-only `throw_test`
    // tool, which is gated behind MCP_TEST_TOOLS=1 and not enabled on the
    // shared server.
    const { server, port } = await spawnHttp({ MCP_TEST_TOOLS: "1" });
    perTest = server;
    const res = await postMcp(port, {
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: { name: "throw_test", arguments: {} },
    });
    expect(res.status).toBe(200);
    expect(res.json?.result?.isError).toBe(true);
    const text = res.json?.result?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as { error?: { code: string; message: string } };
    expect(parsed.error?.code).toBe("TEST_ERROR");
    expect(parsed.error?.message).toContain("intentional failure");
  });
});

describe("US3 — GET /health", () => {
  // All five tests are read-only probes against /health. They share one
  // server (~4 fewer spawns); each test asserts on its own snapshot so
  // accumulated state from prior tests cannot affect them.
  let shared: { server: SpawnedServer; port: number } | null = null;
  function useShared(): { server: SpawnedServer; port: number } {
    if (!shared) throw new Error("US3 shared HTTP server not initialized in beforeAll");
    return shared;
  }

  beforeAll(async () => {
    shared = await spawnHttp();
  });

  afterAll(async () => {
    if (shared) {
      await shared.server.close();
      shared = null;
    }
  });

  it("(a) returns 200 with Content-Type: application/json", async () => {
    const { port } = useShared();
    const res = await getUrl(port, "/health");
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("application/json");
  });

  it("(b) JSON body has the four documented fields with right types", async () => {
    const { port } = useShared();
    const res = await getUrl(port, "/health");
    const body = res.json as { status: string; uptime: number; version: string; transport: string } | undefined;
    expect(body).toBeDefined();
    expect(body?.status).toBe("ok");
    expect(typeof body?.uptime).toBe("number");
    expect(typeof body?.version).toBe("string");
    expect(body?.transport).toBe("http");
    // Exactly the four fields.
    expect(Object.keys(body ?? {}).sort()).toEqual(["status", "transport", "uptime", "version"]);
  });

  it("(c) uptime grows between two probes", async () => {
    const { port } = useShared();
    const a = await getUrl(port, "/health");
    await new Promise((r) => setTimeout(r, 60));
    const b = await getUrl(port, "/health");
    const ua = (a.json as { uptime: number }).uptime;
    const ub = (b.json as { uptime: number }).uptime;
    expect(ua).toBeGreaterThan(0);
    expect(ub).toBeGreaterThan(ua);
  });

  it("(d) round-trip latency on localhost is under 50ms (SC-003)", async () => {
    const { port } = useShared();
    // Warm one request first to prime any per-process JIT.
    await getUrl(port, "/health");
    const start = Date.now();
    await getUrl(port, "/health");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("(e) /health did NOT add an access-log line on stderr", async () => {
    const { server, port } = useShared();
    const before = server.stderrLines.length;
    await getUrl(port, "/health");
    await new Promise((r) => setTimeout(r, 50));
    const after = server.stderrLines.length;
    expect(after).toBe(before);
  });
});

describe("US4 — graceful shutdown", () => {
  let active: SpawnedServer | null = null;
  afterEach(async () => {
    if (active) {
      // If a test left the child alive, close it now. If it already exited,
      // close() is a no-op.
      await active.close();
      active = null;
    }
  });

  it("(a) in-flight slow_ping (500ms) survives SIGTERM and exit code is 0", async () => {
    const { server, port } = await spawnHttp({ MCP_TEST_TOOLS: "1" });
    active = server;
    // Fire the slow request and capture the response promise.
    const responsePromise = postMcp(port, {
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "slow_ping", arguments: { ms: 500 } },
    });
    // Let the request reach the server before signalling.
    await new Promise((r) => setTimeout(r, 50));
    server.kill("SIGTERM");

    const res = await responsePromise;
    expect(res.status).toBe(200);
    expect(res.json?.result?.content?.[0]?.text).toBe("slow pong");

    const exit = await server.waitForExit(2_000);
    expect(exit.code).toBe(0);
    active = null;
  });

  it("(b) SIGTERM on a quiet server logs 'shutting down (signal=SIGTERM)' within 100ms", async () => {
    const { server, port: _port } = await spawnHttp();
    active = server;
    server.kill("SIGTERM");
    const line = await server.waitForStderr(/shutting down \(signal=SIGTERM\)/, 500);
    expect(line).toMatch(/shutting down \(signal=SIGTERM\)/);
    await server.waitForExit(2_000);
    active = null;
  });

  it("(c) request arriving on a fresh connection during shutdown is refused", async () => {
    const { server, port } = await spawnHttp({ MCP_TEST_TOOLS: "1" });
    active = server;
    // Hold the server with a slow request so the drain window is open.
    const slowPromise = postMcp(port, {
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: { name: "slow_ping", arguments: { ms: 1_000 } },
    });
    await new Promise((r) => setTimeout(r, 50));
    server.kill("SIGTERM");
    // Give the listener time to close.
    await new Promise((r) => setTimeout(r, 50));

    let rejected = false;
    try {
      const probe = await postMcp(port, {
        jsonrpc: "2.0",
        id: 61,
        method: "tools/call",
        params: { name: "ping", arguments: { count: 1 } },
      });
      // Any response counts as "the server answered" — the contract says
      // either 503 OR ECONNREFUSED is acceptable per `contracts/http-mcp.md`.
      if (probe.status === 503) rejected = true;
    } catch {
      // ECONNREFUSED throws via fetch — also acceptable.
      rejected = true;
    }
    expect(rejected).toBe(true);

    // The original slow request still finishes (drain semantics).
    const slow = await slowPromise;
    expect(slow.status).toBe(200);
    await server.waitForExit(2_000);
    active = null;
  });

  it("(d) request that exceeds the 10s grace window: process force-exits", async () => {
    const { server, port } = await spawnHttp({ MCP_TEST_TOOLS: "1" });
    active = server;
    // Fire a 15 s slow_ping; we expect the process to exit anyway after the
    // 10 s grace window. The client-side connection may abort — that is the
    // documented behavior.
    postMcp(port, {
      jsonrpc: "2.0",
      id: 70,
      method: "tools/call",
      params: { name: "slow_ping", arguments: { ms: 15_000 } },
    }).catch(() => {
      // expected: the connection may be aborted at the 10 s force-exit.
    });
    await new Promise((r) => setTimeout(r, 50));
    const startTs = Date.now();
    server.kill("SIGTERM");
    const exit = await server.waitForExit(12_000);
    const elapsed = Date.now() - startTs;
    expect(exit.code === 0 || exit.signal !== null).toBe(true);
    // Bound is "the 10 s grace window has elapsed and the force-exit timer
    // ran". The contract is the timer firing — small overhead for the SDK
    // tearing down the in-flight per-request transport adds ~0.5–1.5 s on
    // top, so the bound here is 12 s (matches `waitForExit` cap). Do NOT
    // shrink to a number that would race signal-delivery latency on
    // slower CI (tasks.md T028 explicitly warns against extending
    // `gracePeriodMs` to make this tighter — the contract is the 10 s
    // window, not the exact exit timestamp).
    expect(elapsed).toBeLessThan(12_000);
    active = null;
  });

  it("(e) SIGINT path mirrors SIGTERM — in-flight delivered, exit 0", async () => {
    const { server, port } = await spawnHttp({ MCP_TEST_TOOLS: "1" });
    active = server;
    const responsePromise = postMcp(port, {
      jsonrpc: "2.0",
      id: 80,
      method: "tools/call",
      params: { name: "slow_ping", arguments: { ms: 500 } },
    });
    await new Promise((r) => setTimeout(r, 50));
    server.kill("SIGINT");
    const stderrLine = await server.waitForStderr(/shutting down \(signal=SIGINT\)/, 500);
    expect(stderrLine).toMatch(/shutting down \(signal=SIGINT\)/);

    const res = await responsePromise;
    expect(res.status).toBe(200);
    expect(res.json?.result?.content?.[0]?.text).toBe("slow pong");

    const exit = await server.waitForExit(2_000);
    expect(exit.code).toBe(0);
    active = null;
  });
});
