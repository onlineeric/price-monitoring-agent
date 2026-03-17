import { fromZonedTime, toZonedTime } from "date-fns-tz";

export interface BusinessDayWindow {
  timezone: string;
  start: Date;
  end: Date;
}

export function resolveBusinessTimezone(env: NodeJS.ProcessEnv = process.env): string {
  return env.SCHEDULER_TIMEZONE?.trim() || env.TZ?.trim() || "UTC";
}

export function getBusinessDayWindow(now: Date, timezone = resolveBusinessTimezone()): BusinessDayWindow {
  const zonedNow = toZonedTime(now, timezone);
  const zonedStart = new Date(zonedNow);
  zonedStart.setHours(0, 0, 0, 0);

  const zonedEnd = new Date(zonedStart);
  zonedEnd.setDate(zonedEnd.getDate() + 1);

  return {
    timezone,
    start: fromZonedTime(zonedStart, timezone),
    end: fromZonedTime(zonedEnd, timezone),
  };
}
