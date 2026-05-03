import { describe, expect, it } from "vitest";

import { cronPatternToDescription, settingsToCronPattern } from "./cronConverter";

/**
 * cronConverter is the bridge between the user-facing settings UI and the
 * BullMQ repeatable-job pattern. A drift here means digests fire at the
 * wrong hour — silent, hard to spot. Hence the tight coverage.
 */

describe("settingsToCronPattern", () => {
  it("renders a daily schedule with the hour the user picked", () => {
    expect(settingsToCronPattern({ frequency: "daily", hour: 9 })).toBe("0 9 * * *");
  });

  it("respects an explicit minute when provided", () => {
    expect(settingsToCronPattern({ frequency: "daily", hour: 9, minute: 30 })).toBe("30 9 * * *");
  });

  it("renders a weekly schedule with the dayOfWeek the user picked", () => {
    expect(settingsToCronPattern({ frequency: "weekly", hour: 7, dayOfWeek: 1 })).toBe("0 7 * * 1");
  });

  it("rejects out-of-range hours so a typo doesn't silently produce a malformed cron", () => {
    expect(() => settingsToCronPattern({ frequency: "daily", hour: 24 })).toThrow(/hour/i);
    expect(() => settingsToCronPattern({ frequency: "daily", hour: -1 })).toThrow(/hour/i);
  });

  it("rejects out-of-range minutes", () => {
    expect(() => settingsToCronPattern({ frequency: "daily", hour: 9, minute: 60 })).toThrow(/minute/i);
    expect(() => settingsToCronPattern({ frequency: "daily", hour: 9, minute: -1 })).toThrow(/minute/i);
  });

  it("rejects weekly schedules without a dayOfWeek (the UI must always send one)", () => {
    expect(() => settingsToCronPattern({ frequency: "weekly", hour: 9 })).toThrow(/dayOfWeek/);
  });

  it("rejects weekly dayOfWeek outside 1-7", () => {
    expect(() => settingsToCronPattern({ frequency: "weekly", hour: 9, dayOfWeek: 0 })).toThrow();
    expect(() => settingsToCronPattern({ frequency: "weekly", hour: 9, dayOfWeek: 8 })).toThrow();
  });

  it("rejects unknown frequency values", () => {
    // @ts-expect-error — testing runtime defense for an invalid setting from DB
    expect(() => settingsToCronPattern({ frequency: "hourly", hour: 9 })).toThrow(/frequency/i);
  });
});

describe("cronPatternToDescription", () => {
  it("describes daily patterns with zero-padded clock time", () => {
    expect(cronPatternToDescription("0 9 * * *")).toBe("Daily at 09:00");
    expect(cronPatternToDescription("30 9 * * *")).toBe("Daily at 09:30");
  });

  it("uses weekday names so log lines are operator-friendly", () => {
    expect(cronPatternToDescription("0 9 * * 1")).toBe("Weekly on Monday at 09:00");
    expect(cronPatternToDescription("0 9 * * 7")).toBe("Weekly on Sunday at 09:00");
  });

  it("falls back to the raw pattern for malformed cron strings", () => {
    expect(cronPatternToDescription("not a cron")).toBe("not a cron");
  });

  it("uses 'day N' as a graceful fallback for unrecognized dayOfWeek values", () => {
    expect(cronPatternToDescription("0 9 * * 9")).toBe("Weekly on day 9 at 09:00");
  });
});
