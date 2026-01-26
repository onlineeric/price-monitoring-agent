import { NextResponse } from "next/server";

const WORKER_API_URL = process.env.WORKER_API_URL || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${WORKER_API_URL}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "error", version: null, error: "Worker not responding" },
        { status: 503 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: null,
        error: error instanceof Error ? error.message : "Failed to connect to worker",
      },
      { status: 503 },
    );
  }
}
