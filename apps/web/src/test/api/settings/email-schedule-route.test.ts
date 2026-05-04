import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/settings/email-schedule round-trips the user's digest schedule. Pin:
 *   - GET returns the daily-9-AM default when the row is missing
 *   - GET returns the default if the stored JSON is corrupt
 *   - POST rejects payloads that fail the Zod schema (e.g. weekly without a
 *     dayOfWeek) with HTTP 400 and a `details` array
 *   - POST upserts via ON CONFLICT on the key column
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: dbMock,
  settings: { key: "settings.key" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (c: unknown, v: unknown) => ({ __op: "eq", c, v }),
}));

import { GET, POST } from "@/app/api/settings/email-schedule/route";

function postBody(body: unknown) {
  return new Request("http://test/api/settings/email-schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function mockScheduleRow(value: string | null) {
  const limit = vi.fn().mockResolvedValue(value === null ? [] : [{ value }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/settings/email-schedule", () => {
  it("returns the daily-9-AM default when no row exists", async () => {
    mockScheduleRow(null);
    const response = await GET();
    expect(await response.json()).toEqual({ success: true, schedule: { frequency: "daily", hour: 9 } });
  });

  it("returns the parsed schedule when the row is valid", async () => {
    mockScheduleRow(JSON.stringify({ frequency: "weekly", dayOfWeek: 1, hour: 8 }));
    const json = await (await GET()).json();
    expect(json.schedule).toEqual({ frequency: "weekly", dayOfWeek: 1, hour: 8 });
  });

  it("returns the default when the stored JSON is malformed (no 500)", async () => {
    mockScheduleRow("{not-json");
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.schedule).toEqual({ frequency: "daily", hour: 9 });
  });

  it("returns the default when the stored payload fails schema validation", async () => {
    mockScheduleRow(JSON.stringify({ frequency: "monthly", hour: 9 }));
    const json = await (await GET()).json();
    expect(json.schedule).toEqual({ frequency: "daily", hour: 9 });
  });
});

describe("POST /api/settings/email-schedule", () => {
  function mockUpsert() {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValueOnce({ values });
    return { values, onConflictDoUpdate };
  }

  it("returns 400 with `details` on validation failure (weekly without dayOfWeek)", async () => {
    const response = await POST(postBody({ frequency: "weekly", hour: 9 }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Validation failed");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("returns 400 when hour is out of range", async () => {
    const response = await POST(postBody({ frequency: "daily", hour: 99 }));
    expect(response.status).toBe(400);
  });

  it("upserts a valid schedule on the email_schedule key (ON CONFLICT update)", async () => {
    const { values, onConflictDoUpdate } = mockUpsert();

    const response = await POST(postBody({ frequency: "daily", hour: 7 }));

    expect(response.status).toBe(200);
    const insertedRow = values.mock.calls[0][0] as { key: string; value: string };
    expect(insertedRow.key).toBe("email_schedule");
    expect(JSON.parse(insertedRow.value)).toEqual({ frequency: "daily", hour: 7 });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ target: "settings.key" }));
  });
});
