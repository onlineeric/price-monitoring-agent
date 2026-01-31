import { db } from "@price-monitor/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const VERSION = process.env.npm_package_version || "unknown";

export async function GET() {
  try {
    // Quick database connectivity check
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: VERSION,
        error: error instanceof Error ? error.message : "Database connection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
