import { describe, expect, it } from "vitest";

import { emailScheduleSchema } from "./settings";

/**
 * emailScheduleSchema is the API/UI boundary for the digest schedule.
 * Catching a relaxed contract here is much cheaper than hunting it down
 * after a misshapen schedule reaches BullMQ.
 */

describe("emailScheduleSchema", () => {
  it("accepts a daily schedule with a valid hour", () => {
    expect(emailScheduleSchema.safeParse({ frequency: "daily", hour: 9 }).success).toBe(true);
  });

  it("accepts a weekly schedule when dayOfWeek is provided", () => {
    expect(emailScheduleSchema.safeParse({ frequency: "weekly", hour: 9, dayOfWeek: 1 }).success).toBe(true);
  });

  it("rejects a weekly schedule with no dayOfWeek and points the error at that field", () => {
    const result = emailScheduleSchema.safeParse({ frequency: "weekly", hour: 9 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = result.error.issues;
    expect(issues.some((i) => i.path.includes("dayOfWeek"))).toBe(true);
  });

  it("rejects out-of-range hour", () => {
    expect(emailScheduleSchema.safeParse({ frequency: "daily", hour: 24 }).success).toBe(false);
    expect(emailScheduleSchema.safeParse({ frequency: "daily", hour: -1 }).success).toBe(false);
  });

  it("rejects out-of-range dayOfWeek", () => {
    expect(emailScheduleSchema.safeParse({ frequency: "weekly", hour: 9, dayOfWeek: 0 }).success).toBe(false);
    expect(emailScheduleSchema.safeParse({ frequency: "weekly", hour: 9, dayOfWeek: 8 }).success).toBe(false);
  });

  it("rejects unknown frequency strings", () => {
    expect(emailScheduleSchema.safeParse({ frequency: "hourly", hour: 9 }).success).toBe(false);
  });
});
