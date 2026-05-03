import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

let clientPromise: Promise<Client> | null = null;

// Env reads happen here (not at module top) so any side-effect dotenv loaders
// — e.g. `@price-monitor/db` populating process.env from the root `.env` —
// have already run by the time the first chat request triggers a connect.
function createTransport(): Transport {
  const httpUrl = process.env.MCP_HTTP_URL;
  if (httpUrl) {
    return new StreamableHTTPClientTransport(new URL(httpUrl));
  }
  const command = process.env.MCP_SERVER_COMMAND ?? "pnpm";
  const args = process.env.MCP_SERVER_ARGS
    ? process.env.MCP_SERVER_ARGS.split(" ")
    : ["--filter", "@price-monitor/mcp-server", "start"];
  return new StdioClientTransport({
    command,
    args,
    stderr: "inherit",
  });
}

async function createClient(): Promise<Client> {
  const transport = createTransport();

  const client = new Client(
    { name: "price-monitor-web", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

export function getMcpClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function listMcpTools() {
  const client = await getMcpClient();
  const { tools } = await client.listTools();
  return tools;
}

export async function closeMcpClient(): Promise<void> {
  if (!clientPromise) return;
  const pending = clientPromise;
  clientPromise = null;
  const client = await pending.catch(() => null);
  if (client) await client.close();
}
