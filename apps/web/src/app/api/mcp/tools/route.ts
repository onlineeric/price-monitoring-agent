import { NextResponse } from "next/server";
import { listMcpTools } from "@/lib/mcp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tools = await listMcpTools();
    return NextResponse.json({
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list MCP tools",
      },
      { status: 500 },
    );
  }
}
