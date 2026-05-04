import { connect } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type SpawnedServer, spawnServer } from "./helpers/spawn-server.js";

/**
 * US2 — IDE-side stdio integration continues to work unchanged.
 *
 * Spawn the server with `MCP_TRANSPORT` unset (the documented default),
 * exchange a JSON-RPC frame on stdin/stdout, and assert: (a) the JSON-RPC
 * response is well-formed, (b) stdout received only valid JSON-RPC frames,
 * (c) the startup log line appears on stderr, (d) no HTTP listener was
 * opened.
 *
 * Tests (a) (b) (c) share one stdio child — they are read-only probes whose
 * assertions snapshot their own slice of stdout/stderr. Test (d) opens a
 * different MCP_HTTP_PORT to assert no listener binds, so it spawns its own.
 */

describe("US2 — stdio transport (no regression)", () => {
  let shared: SpawnedServer | null = null;
  let perTest: SpawnedServer | null = null;
  function useShared(): SpawnedServer {
    if (!shared) throw new Error("US2 shared stdio server not initialized in beforeAll");
    return shared;
  }

  beforeAll(async () => {
    shared = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    await shared.waitForStderr(/ready on stdio/, 5_000);
  });

  afterAll(async () => {
    if (shared) {
      await shared.close();
      shared = null;
    }
  });

  afterEach(async () => {
    if (perTest) {
      await perTest.close();
      perTest = null;
    }
  });

  it("(a) tools/list over stdin returns the five expected tool names", async () => {
    const server = useShared();
    const stdoutPromise = server.waitForStdout(/"id":1/, 5_000);
    server.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
    const line = await stdoutPromise;
    const parsed = JSON.parse(line) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = (parsed.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(
      ["add_product", "get_price_summary", "get_product_history", "ping", "search_products"].sort(),
    );
  });

  it("(b) stdout receives only valid JSON-RPC frames (stdout-purity guard)", async () => {
    const server = useShared();
    // Drive the server with two frames using ids that are unique to this test
    // so the waiter does not match a frame from a previous test.
    const wait1 = server.waitForStdout(/"id":1001/, 5_000);
    server.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1001, method: "tools/list", params: {} })}\n`,
    );
    await wait1;
    const wait2 = server.waitForStdout(/"id":1002/, 5_000);
    server.child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1002,
        method: "tools/call",
        params: { name: "ping", arguments: { count: 2 } },
      })}\n`,
    );
    await wait2;

    // Every non-empty stdout line MUST parse as a JSON-RPC frame.
    const lines = server.stdoutLines().filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { jsonrpc?: string };
      expect(parsed.jsonrpc).toBe("2.0");
    }
  });

  it("(c) stderr received the startup line", async () => {
    const server = useShared();
    const line = await server.waitForStderr(/\[mcp-server\] price-monitor-mcp-server ready on stdio/, 5_000);
    expect(line).toMatch(/\[mcp-server\] price-monitor-mcp-server ready on stdio/);
  });

  it("(d) no HTTP listener bound on the configured port (FR-002, FR-006)", async () => {
    // Use an off-the-beaten-path port so we don't conflict with whatever the
    // developer may have running on 3002 (the docker mcp-server container,
    // for instance). The contract under test is "stdio mode opens no HTTP
    // listener at all", which is independent of the specific port number.
    const probePort = 51_888;
    const server = spawnServer({ env: { MCP_TRANSPORT: undefined, MCP_HTTP_PORT: String(probePort) } });
    perTest = server;
    await server.waitForStderr(/ready on stdio/, 5_000);

    // Try to connect to the configured HTTP port. Must fail with ECONNREFUSED
    // (or similar) — proving stdio mode never opens an HTTP listener.
    const probe = await new Promise<{ connected: boolean; code?: string }>((resolve) => {
      const sock = connect({ host: "127.0.0.1", port: probePort });
      sock.once("error", (err: NodeJS.ErrnoException) => {
        const result: { connected: boolean; code?: string } = { connected: false };
        if (err.code !== undefined) result.code = err.code;
        resolve(result);
      });
      sock.once("connect", () => {
        sock.destroy();
        resolve({ connected: true });
      });
    });
    expect(probe.connected).toBe(false);
    expect(probe.code).toMatch(/ECONNREFUSED|EHOSTUNREACH/);
  });
});
