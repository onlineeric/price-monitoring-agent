import { NextResponse } from "next/server";

import { db, SETTING_LAST_BULK_REFRESH_COMPLETED_AT, settings } from "@price-monitor/db";
import { eq } from "drizzle-orm";

/**
 * GET /api/digest/status
 *
 * Lightweight read of the "last bulk refresh completed" marker the worker
 * stamps when a "Check All" digest batch finishes refreshing every product.
 * The dashboard polls this (scoped to an in-flight batch) and, once the marker
 * advances past the value it captured at trigger time, reveals a "refresh
 * available" signal — so the product list is never auto-refreshed underneath
 * the user.
 */
export async function GET() {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTING_LAST_BULK_REFRESH_COMPLETED_AT))
      .limit(1);

    return NextResponse.json({ success: true, lastCompletedAt: row?.value ?? null });
  } catch (error) {
    console.error("[API] Error reading digest status:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to read digest status" },
      { status: 500 },
    );
  }
}
