import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * send-limits is the manual-report rate-limit/quota engine. We pin:
 *   - the rolling-window counter blocks at >= 5 in 10 min (and reports the
 *     timestamp the next slot frees up)
 *   - the daily recipient quota blocks once cumulative recipients > 99
 *   - reason codes flow through getManualReportSendAvailability in the
 *     documented priority order: preview-unavailable > no-active-products
 *     > rolling-window-limit > daily-recipient-limit > none
 *   - withManualReportSendLock acquires/releases the Redis NX lock so two
 *     concurrent POST /api/manual-report/send calls cannot duplicate sends
 */

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
}));

const dbMock = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn();
  return { select, insert, db: { select, insert } };
});

vi.mock("@/lib/redis", () => ({ redisConnection: redisMock }));

vi.mock("@price-monitor/db", () => ({
  db: dbMock.db,
  and: (...args: unknown[]) => ({ __op: "and", args }),
  asc: (col: unknown) => ({ __op: "asc", col }),
  gte: (col: unknown, val: unknown) => ({ __op: "gte", col, val }),
  lt: (col: unknown, val: unknown) => ({ __op: "lt", col, val }),
  sql: (parts: TemplateStringsArray, ...vals: unknown[]) => ({ __op: "sql", parts, vals }),
  manualReportSends: {
    completedAt: "manualReportSends.completedAt",
    recipientCount: "manualReportSends.recipientCount",
  },
}));

import {
  DAILY_RECIPIENT_LIMIT,
  getManualReportSendAvailability,
  getManualReportUsage,
  recordCompletedManualReportSend,
  ROLLING_WINDOW_LIMIT,
  withManualReportSendLock,
} from "./send-limits";

function mockUsageQueries(rollingRows: Array<{ completedAt: Date }>, dailyRecipientCount: number) {
  // Two select() calls happen in parallel: rolling window first, then daily total.
  const rollingChain = () => ({
    from: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue(rollingRows) }) }),
  });
  const dailyChain = () => ({
    from: () => ({ where: vi.fn().mockResolvedValue([{ recipientCount: dailyRecipientCount }]) }),
  });
  dbMock.select.mockImplementationOnce(rollingChain).mockImplementationOnce(dailyChain);
}

beforeEach(() => {
  redisMock.set.mockReset();
  redisMock.eval.mockReset();
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getManualReportUsage", () => {
  it("returns blockedUntil = oldest + 10min when the rolling window is full", async () => {
    const now = new Date("2026-03-17T09:00:00.000Z");
    const oldest = new Date("2026-03-17T08:55:00.000Z");
    mockUsageQueries(
      Array.from({ length: ROLLING_WINDOW_LIMIT }, (_, i) => ({
        completedAt: new Date(oldest.getTime() + i * 60_000),
      })),
      0,
    );

    const usage = await getManualReportUsage(now);

    expect(usage.rollingWindowUsed).toBe(ROLLING_WINDOW_LIMIT);
    expect(usage.blockedUntil).toEqual(new Date(oldest.getTime() + 10 * 60_000));
  });

  it("returns blockedUntil = null when usage is below the rolling-window limit", async () => {
    mockUsageQueries([{ completedAt: new Date() }], 0);

    const usage = await getManualReportUsage();

    expect(usage.blockedUntil).toBeNull();
  });
});

describe("getManualReportSendAvailability", () => {
  it("reason='preview-unavailable' takes priority over everything else", async () => {
    mockUsageQueries([], 0);
    const avail = await getManualReportSendAvailability({
      productCount: 0,
      previewAvailable: false,
    });
    expect(avail.canSend).toBe(false);
    expect(avail.reason).toBe("preview-unavailable");
  });

  it("reason='no-active-products' when productCount is 0 (preview present)", async () => {
    mockUsageQueries([], 0);
    const avail = await getManualReportSendAvailability({ productCount: 0 });
    expect(avail.reason).toBe("no-active-products");
  });

  it("reason='rolling-window-limit' once the rolling window is full", async () => {
    mockUsageQueries(
      Array.from({ length: ROLLING_WINDOW_LIMIT }, () => ({ completedAt: new Date() })),
      0,
    );
    const avail = await getManualReportSendAvailability({ productCount: 1 });
    expect(avail.reason).toBe("rolling-window-limit");
  });

  it("reason='daily-recipient-limit' when the proposed send would exceed 99/day", async () => {
    mockUsageQueries([], DAILY_RECIPIENT_LIMIT - 1);
    const avail = await getManualReportSendAvailability({
      productCount: 1,
      recipientCount: 5,
    });
    expect(avail.reason).toBe("daily-recipient-limit");
  });

  it("returns canSend=true / reason='none' on the happy path", async () => {
    mockUsageQueries([], 0);
    const avail = await getManualReportSendAvailability({
      productCount: 3,
      recipientCount: 2,
    });
    expect(avail.canSend).toBe(true);
    expect(avail.reason).toBe("none");
  });
});

describe("recordCompletedManualReportSend", () => {
  it("inserts a manualReportSends row with the supplied recipientCount", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValueOnce({ values });

    await recordCompletedManualReportSend({
      recipientCount: 3,
      previewGeneratedAt: new Date("2026-03-17T09:00:00.000Z"),
      providerMessageId: "msg_1",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientCount: 3,
        providerMessageId: "msg_1",
      }),
    );
  });
});

describe("withManualReportSendLock", () => {
  it("returns null without running the work when the lock is already held", async () => {
    redisMock.set.mockResolvedValueOnce(null); // SET NX failed
    const work = vi.fn();

    const result = await withManualReportSendLock(work);

    expect(result).toBeNull();
    expect(work).not.toHaveBeenCalled();
  });

  it("runs work, returns its value, and releases the lock when acquired", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    redisMock.eval.mockResolvedValueOnce(1);

    const result = await withManualReportSendLock(async () => "done");

    expect(result).toBe("done");
    expect(redisMock.set).toHaveBeenCalledWith(
      "manual-report:send-lock",
      expect.any(String),
      "PX",
      expect.any(Number),
      "NX",
    );
    expect(redisMock.eval).toHaveBeenCalled();
  });

  it("releases the lock even when the work throws", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    redisMock.eval.mockResolvedValueOnce(1);

    await expect(
      withManualReportSendLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(redisMock.eval).toHaveBeenCalled();
  });
});
