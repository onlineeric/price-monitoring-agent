import { db, settings, eq } from "@price-monitor/db";

/**
 * Email schedule configuration
 */
export interface EmailSchedule {
  frequency: "daily" | "weekly";
  dayOfWeek?: number; // 1-7 (1=Monday, 7=Sunday), only for weekly
  hour: number; // 0-23
}

/**
 * Get a setting value by key
 */
export async function getSetting(key: string): Promise<string | null> {
  const [result] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  return result?.value || null;
}

/**
 * Set a setting value (upsert)
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Get the email schedule configuration
 * Returns default if not set or invalid
 */
export async function getEmailSchedule(): Promise<EmailSchedule> {
  const value = await getSetting("email_schedule");

  if (!value) {
    // Default: daily at 9:00 AM
    return { frequency: "daily", hour: 9 };
  }

  try {
    return JSON.parse(value) as EmailSchedule;
  } catch {
    console.error("[Settings] Failed to parse email_schedule, using default");
    return { frequency: "daily", hour: 9 };
  }
}

/**
 * Set the email schedule configuration
 */
export async function setEmailSchedule(schedule: EmailSchedule): Promise<void> {
  await setSetting("email_schedule", JSON.stringify(schedule));
}
