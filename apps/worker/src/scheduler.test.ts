import type { Queue } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DigestScheduler reconciles the BullMQ repeatable job for the email digest
 * with the email_schedule row in the database. The behaviour we lock here:
 *
 *   - on start(), it reads the schedule and registers a repeatable job
 *   - if a stale (different cron / wrong tz) repeatable job already exists,
 *     it is removed and replaced with one matching the current settings
 *   - if a matching job already exists, no new job is added (idempotent)
 *   - if no schedule row exists at all, it removes any leftover digest jobs
 *   - stop() clears the polling timer and removes the digest job(s)
 *
 * The Drizzle and Queue layers are mocked at module boundaries — the test
 * exercises the orchestration logic, not Postgres or Redis.
 */

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@price-monitor/db", () => ({
  db: { select: dbMock.select },
  eq: (col: unknown, val: unknown) => ({ __op: "eq", col, val }),
  settings: { key: "settings.key" },
}));

import { DigestScheduler } from "./scheduler";

interface RepeatableJob {
  name: string;
  key: string;
  pattern: string;
  tz: string | null | undefined;
}

interface FakeQueue {
  add: ReturnType<typeof vi.fn>;
  getRepeatableJobs: ReturnType<typeof vi.fn>;
  removeRepeatableByKey: ReturnType<typeof vi.fn>;
}

function makeQueue(initialJobs: RepeatableJob[] = []): FakeQueue {
  const jobs = [...initialJobs];
  return {
    add: vi.fn(async (name: string, _data: unknown, opts: { repeat: { pattern: string; key: string; tz: string } }) => {
      jobs.push({ name, key: opts.repeat.key, pattern: opts.repeat.pattern, tz: opts.repeat.tz });
    }),
    getRepeatableJobs: vi.fn(async () => [...jobs]),
    removeRepeatableByKey: vi.fn(async (key: string) => {
      const idx = jobs.findIndex((j) => j.key === key);
      if (idx >= 0) jobs.splice(idx, 1);
    }),
  };
}

function mockScheduleRow(value: { frequency: string; hour: number; dayOfWeek?: number } | null) {
  const limit = vi.fn().mockResolvedValue(value === null ? [] : [{ value: JSON.stringify(value) }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  dbMock.select.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DigestScheduler.start", () => {
  it("registers a fresh repeatable job when none exist for the current schedule", async () => {
    mockScheduleRow({ frequency: "daily", hour: 9 });
    const queue = makeQueue();
    const scheduler = new DigestScheduler(queue as unknown as Queue, "UTC");

    await scheduler.start();

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, , opts] = queue.add.mock.calls[0];
    expect(name).toBe("send-digest-scheduled");
    expect(opts.repeat).toEqual(expect.objectContaining({ key: "digest-schedule-v1", tz: "UTC" }));

    await scheduler.stop();
  });

  it("removes any existing digest jobs and noop-creates when no schedule row exists", async () => {
    mockScheduleRow(null);
    const queue = makeQueue([{ name: "send-digest-scheduled", key: "stale-1", pattern: "0 9 * * *", tz: "UTC" }]);
    const scheduler = new DigestScheduler(queue as unknown as Queue, "UTC");

    await scheduler.start();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("stale-1");
    expect(queue.add).not.toHaveBeenCalled();

    await scheduler.stop();
  });

  it("is idempotent: keeps an already-matching repeatable job and does not add a duplicate", async () => {
    mockScheduleRow({ frequency: "daily", hour: 9 });
    const queue = makeQueue([
      { name: "send-digest-scheduled", key: "existing", pattern: "0 9 * * *", tz: "UTC" },
    ]);
    const scheduler = new DigestScheduler(queue as unknown as Queue, "UTC");

    await scheduler.start();

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();

    await scheduler.stop();
  });

  it("replaces a stale repeatable job whose timezone differs from the configured one", async () => {
    mockScheduleRow({ frequency: "daily", hour: 9 });
    const queue = makeQueue([
      { name: "send-digest-scheduled", key: "old-tz", pattern: "0 9 * * *", tz: "America/New_York" },
    ]);
    const scheduler = new DigestScheduler(queue as unknown as Queue, "UTC");

    await scheduler.start();

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("old-tz");
    expect(queue.add).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  it("ignores schedule rows missing required fields", async () => {
    mockScheduleRow({ frequency: "" as never, hour: 9 });
    const queue = makeQueue();
    const scheduler = new DigestScheduler(queue as unknown as Queue);

    await scheduler.start();

    // Treated like "no schedule" — no job added.
    expect(queue.add).not.toHaveBeenCalled();

    await scheduler.stop();
  });
});

describe("DigestScheduler.stop", () => {
  it("removes all digest repeatable jobs and clears the polling interval", async () => {
    mockScheduleRow({ frequency: "daily", hour: 9 });
    const queue = makeQueue();
    const scheduler = new DigestScheduler(queue as unknown as Queue);

    await scheduler.start();
    queue.removeRepeatableByKey.mockClear();
    queue.add.mockClear();

    // Provide the row that stop() does NOT actually need; stop() reads jobs from the queue.
    await scheduler.stop();

    // The job we registered in start() should now be removed.
    expect(queue.removeRepeatableByKey).toHaveBeenCalled();

    // Advancing the timer should NOT trigger another updateSchedule call.
    dbMock.select.mockClear();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});
