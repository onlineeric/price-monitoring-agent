import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_COMMAND = process.env.MCP_SERVER_COMMAND ?? "pnpm";
const SERVER_ARGS = process.env.MCP_SERVER_ARGS
  ? process.env.MCP_SERVER_ARGS.split(" ")
  : ["--filter", "@price-monitor/mcp-server", "start"];

let clientPromise: Promise<Client> | null = null;

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: SERVER_COMMAND,
    args: SERVER_ARGS,
    stderr: "inherit",
  });

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
