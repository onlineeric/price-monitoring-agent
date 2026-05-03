import { connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { spawnServer, type SpawnedServer } from "./helpers/spawn-server.js";

/**
 * US2 — IDE-side stdio integration continues to work unchanged.
 *
 * Spawn the server with `MCP_TRANSPORT` unset (the documented default),
 * exchange a JSON-RPC frame on stdin/stdout, and assert: (a) the JSON-RPC
 * response is well-formed, (b) stdout received only valid JSON-RPC frames,
 * (c) the startup log line appears on stderr, (d) no HTTP listener was
 * opened.
 */

describe("US2 — stdio transport (no regression)", () => {
  let active: SpawnedServer | null = null;
  afterEach(async () => {
    if (active) {
      await active.close();
      active = null;
    }
  });

  it("(a) tools/list over stdin returns the five expected tool names", async () => {
    const server = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    active = server;
    await server.waitForStderr(/ready on stdio/, 5_000);

    const stdoutPromise = server.waitForStdout(/"result"/, 5_000);
    server.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`,
    );
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
    const server = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    active = server;
    await server.waitForStderr(/ready on stdio/, 5_000);

    // Drive the server with a couple of frames so the buffer is non-trivial.
    const wait1 = server.waitForStdout(/"id":1/, 5_000);
    server.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`,
    );
    await wait1;
    const wait2 = server.waitForStdout(/"id":2/, 5_000);
    server.child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
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
    const server = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    active = server;
    const line = await server.waitForStderr(
      /\[mcp-server\] price-monitor-mcp-server ready on stdio/,
      5_000,
    );
    expect(line).toMatch(/\[mcp-server\] price-monitor-mcp-server ready on stdio/);
  });

  it("(d) no HTTP listener bound on default port 3001 (FR-002, FR-006)", async () => {
    const server = spawnServer({ env: { MCP_TRANSPORT: undefined } });
    active = server;
    await server.waitForStderr(/ready on stdio/, 5_000);

    // Try to connect to the default HTTP port. Must fail with ECONNREFUSED
    // (or similar) — proving stdio mode never opens an HTTP listener.
    const probe = await new Promise<{ connected: boolean; code?: string }>((resolve) => {
      const sock = connect({ host: "127.0.0.1", port: 3001 });
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
