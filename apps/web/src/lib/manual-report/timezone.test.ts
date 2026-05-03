import { describe, expect, it } from "vitest";

import { getBusinessDayWindow, resolveBusinessTimezone } from "./timezone";

/**
 * The business-day window backs the daily-send-cap. Test the timezone
 * resolution priority (SCHEDULER_TIMEZONE → TZ → UTC) and the basic shape
 * of the produced window.
 */

describe("resolveBusinessTimezone", () => {
  it("prefers SCHEDULER_TIMEZONE over TZ over UTC", () => {
    expect(
      resolveBusinessTimezone({ SCHEDULER_TIMEZONE: "America/New_York", TZ: "Europe/London" } as unknown as NodeJS.ProcessEnv),
    ).toBe("America/New_York");
    expect(resolveBusinessTimezone({ TZ: "Europe/London" } as unknown as NodeJS.ProcessEnv)).toBe("Europe/London");
    expect(resolveBusinessTimezone({} as unknown as NodeJS.ProcessEnv)).toBe("UTC");
  });

  it("ignores empty / whitespace-only values (operator typo guard)", () => {
    expect(resolveBusinessTimezone({ SCHEDULER_TIMEZONE: "   " } as unknown as NodeJS.ProcessEnv)).toBe("UTC");
    expect(resolveBusinessTimezone({ SCHEDULER_TIMEZONE: "", TZ: "Europe/Paris" } as unknown as NodeJS.ProcessEnv)).toBe(
      "Europe/Paris",
    );
  });
});

describe("getBusinessDayWindow", () => {
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  it("preserves the timezone field on the returned window", () => {
    const w = getBusinessDayWindow(new Date("2026-03-05T12:34:56Z"), "UTC");
    expect(w.timezone).toBe("UTC");
    const w2 = getBusinessDayWindow(new Date("2026-03-05T12:34:56Z"), "America/New_York");
    expect(w2.timezone).toBe("America/New_York");
  });

  it("returns a window that spans roughly 24 hours (allowing for DST transitions)", () => {
    // The exact boundary depends on date-fns-tz's `format` and the runtime's
    // local timezone, so we assert the shape rather than absolute timestamps.
    // DST transitions can yield 23h or 25h windows — both are acceptable.
    const w = getBusinessDayWindow(new Date("2026-03-05T12:34:56Z"), "UTC");
    const span = w.end.getTime() - w.start.getTime();
    expect(span).toBeGreaterThanOrEqual(23 * ONE_HOUR);
    expect(span).toBeLessThanOrEqual(25 * ONE_HOUR);
  });

  it("end is strictly after start (basic ordering invariant)", () => {
    const w = getBusinessDayWindow(new Date("2026-03-05T12:34:56Z"), "UTC");
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
    // Window length is at most one day plus DST headroom.
    expect(w.end.getTime() - w.start.getTime()).toBeLessThanOrEqual(ONE_DAY + ONE_HOUR);
  });
});
