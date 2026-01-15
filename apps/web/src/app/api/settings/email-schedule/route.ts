import { type NextRequest, NextResponse } from "next/server";

import { db, settings } from "@price-monitor/db";
import { eq } from "drizzle-orm";

import { emailScheduleSchema } from "@/lib/validations/settings";

export async function GET() {
  try {
    const [result] = await db.select().from(settings).where(eq(settings.key, "email_schedule")).limit(1);

    if (!result) {
      // Return default schedule
      return NextResponse.json({
        success: true,
        schedule: {
          frequency: "daily",
          hour: 9,
        },
      });
    }

    // Parse and validate JSON from database
    try {
      const parsed = JSON.parse(result.value);
      const validation = emailScheduleSchema.safeParse(parsed);

      if (!validation.success) {
        console.error("[API] Invalid schedule data in database:", validation.error);
        // Return default schedule if stored data is invalid
        return NextResponse.json({
          success: true,
          schedule: {
            frequency: "daily",
            hour: 9,
          },
        });
      }

      return NextResponse.json({
        success: true,
        schedule: validation.data,
      });
    } catch (parseError) {
      console.error("[API] Failed to parse schedule JSON from database:", parseError);
      // Return default schedule if JSON is malformed
      return NextResponse.json({
        success: true,
        schedule: {
          frequency: "daily",
          hour: 9,
        },
      });
    }
  } catch (error) {
    console.error("[API] Error fetching email schedule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch email schedule",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = emailScheduleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.errors,
        },
        { status: 400 },
      );
    }

    const schedule = validation.data;

    // Upsert schedule to database
    await db
      .insert(settings)
      .values({
        key: "email_schedule",
        value: JSON.stringify(schedule),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: JSON.stringify(schedule),
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error("[API] Error updating email schedule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update email schedule",
      },
      { status: 500 },
    );
  }
}
