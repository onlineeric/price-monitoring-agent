import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/digest/status returns the worker's "last bulk refresh completed"
 * marker so the dashboard can detect when a Check-All batch has finished:
 *   - { lastCompletedAt: <iso> } when the marker row exists
 *   - { lastCompletedAt: null } when it has never run
 *   - 500 when the DB read throws
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  settings: { key: "settings.key" },
  SETTING_LAST_BULK_REFRESH_COMPLETED_AT: "last_bulk_refresh_completed_at",
}));
vi.mock("drizzle-orm", () => ({ eq: (c: unknown, v: unknown) => ({ __op: "eq", c, v }) }));

import { GET } from "@/app/api/digest/status/route";

function mockMarkerRow(row: Record<string, unknown> | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  dbMock.select.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/digest/status", () => {
  it("returns the marker value when present", async () => {
    mockMarkerRow({ key: "last_bulk_refresh_completed_at", value: "2026-06-14T10:00:00.000Z" });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, lastCompletedAt: "2026-06-14T10:00:00.000Z" });
  });

  it("returns null when the marker has never been set", async () => {
    mockMarkerRow(null);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, lastCompletedAt: null });
  });

  it("returns 500 when the DB read throws", async () => {
    dbMock.select.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const response = await GET();
    expect(response.status).toBe(500);
  });
});
