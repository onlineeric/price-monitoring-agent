import { NextResponse } from "next/server";

// `MCP_HTTP_URL` is documented as the `/mcp` JSON-RPC endpoint URL (so
// the web's MCP client can use it directly). Appending `/health` here
// therefore probes `/mcp/health`, which the MCP server exposes alongside
// `/health` for exactly this composition. Default mirrors `.env.example`.
const MCP_HTTP_URL = process.env.MCP_HTTP_URL ?? "http://localhost:3002/mcp";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${MCP_HTTP_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "error", version: null, error: "MCP server not responding" },
        { status: 503 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "MCP server health check timed out"
          : error.message
        : "Failed to connect to MCP server";

    return NextResponse.json(
      { status: "error", version: null, error: message },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
