import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * settingsService is the read/write boundary for the `settings` key/value
 * table. The only non-trivial logic is the safe parse + default fallback for
 * email_schedule — we pin it here so a corrupt row cannot break the worker.
 */

const dbMock = vi.hoisted(() => {
  const insert = vi.fn();
  const select = vi.fn();
  return { insert, select, db: { insert, select } };
});

vi.mock("@price-monitor/db", () => ({
  db: dbMock.db,
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
  settings: { key: "settings.key", value: "settings.value" },
}));

import { getEmailSchedule, getSetting, setEmailSchedule, setSetting } from "./settingsService";

beforeEach(() => {
  dbMock.insert.mockReset();
  dbMock.select.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockSelectOnce(rows: Array<{ value: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

describe("getSetting", () => {
  it("returns the stored value when present", async () => {
    mockSelectOnce([{ value: "v1" }]);
    expect(await getSetting("k")).toBe("v1");
  });

  it("returns null when no row matches", async () => {
    mockSelectOnce([]);
    expect(await getSetting("k")).toBeNull();
  });
});

describe("setSetting", () => {
  it("upserts via ON CONFLICT on the key column", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });

    await setSetting("k", "v");

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ key: "k", value: "v" }));
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ target: "settings.key" }));
  });
});

describe("getEmailSchedule", () => {
  it("returns the daily-9-AM default when the setting is missing", async () => {
    mockSelectOnce([]);
    expect(await getEmailSchedule()).toEqual({ frequency: "daily", hour: 9 });
  });

  it("returns the parsed schedule when the row is valid JSON", async () => {
    mockSelectOnce([{ value: JSON.stringify({ frequency: "weekly", dayOfWeek: 1, hour: 8 }) }]);
    expect(await getEmailSchedule()).toEqual({ frequency: "weekly", dayOfWeek: 1, hour: 8 });
  });

  it("falls back to default when the stored value is malformed JSON (does not throw)", async () => {
    mockSelectOnce([{ value: "{not-json" }]);
    expect(await getEmailSchedule()).toEqual({ frequency: "daily", hour: 9 });
  });
});

describe("setEmailSchedule", () => {
  it("serializes the schedule and writes it under the email_schedule key", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });

    await setEmailSchedule({ frequency: "daily", hour: 7 });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "email_schedule",
        value: JSON.stringify({ frequency: "daily", hour: 7 }),
      }),
    );
  });
});
