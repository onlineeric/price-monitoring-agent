import { addDays } from "date-fns";
import { format, fromZonedTime } from "date-fns-tz";

export interface BusinessDayWindow {
  timezone: string;
  start: Date;
  end: Date;
}

export function resolveBusinessTimezone(env: NodeJS.ProcessEnv = process.env): string {
  return env.SCHEDULER_TIMEZONE?.trim() || env.TZ?.trim() || "UTC";
}

export function getBusinessDayWindow(now: Date, timezone = resolveBusinessTimezone()): BusinessDayWindow {
  // Use format with the target timezone to get the correct calendar date — avoids
  // setHours() which always uses the JS runtime's local timezone, not the target one.
  const todayStr = format(now, "yyyy-MM-dd", { timeZone: timezone });
  const start = fromZonedTime(`${todayStr}T00:00:00`, timezone);
  // Add ~25h to midnight to safely cross into the next calendar day regardless of DST,
  // then format in the target timezone to get the correct date string.
  const tomorrowStr = format(addDays(start, 1), "yyyy-MM-dd", { timeZone: timezone });
  const end = fromZonedTime(`${tomorrowStr}T00:00:00`, timezone);

  return { timezone, start, end };
}
