import { db } from "@price-monitor/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { webVersion } from "@/lib/version";

export async function GET() {
  try {
    // Quick database connectivity check
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      status: "ok",
      version: webVersion,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: webVersion,
        error: error instanceof Error ? error.message : "Database connection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
