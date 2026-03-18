import { randomUUID } from "node:crypto";

import { and, asc, db, gte, lt, manualReportSends, sql } from "@price-monitor/db";

import { redisConnection } from "@/lib/redis";

import { getBusinessDayWindow } from "./timezone";

export const ROLLING_WINDOW_LIMIT = 3;
export const ROLLING_WINDOW_MINUTES = 10;
export const DAILY_RECIPIENT_LIMIT = 99;

const SEND_LOCK_KEY = "manual-report:send-lock";
const SEND_LOCK_TTL_MS = 15_000;

export type ManualReportAvailabilityReason =
  | "none"
  | "no-active-products"
  | "rolling-window-limit"
  | "daily-recipient-limit"
  | "preview-unavailable";

export interface ManualReportSendAvailability {
  canSend: boolean;
  rollingWindowUsed: number;
  rollingWindowLimit: number;
  dailyRecipientsUsed: number;
  dailyRecipientsLimit: number;
  blockedUntil: Date | null;
  reason: ManualReportAvailabilityReason;
}

export interface ManualReportUsage {
  rollingWindowUsed: number;
  dailyRecipientsUsed: number;
  blockedUntil: Date | null;
}

function getRollingWindowStart(now: Date) {
  return new Date(now.getTime() - ROLLING_WINDOW_MINUTES * 60 * 1000);
}

export async function getManualReportUsage(now = new Date()): Promise<ManualReportUsage> {
  const rollingWindowStart = getRollingWindowStart(now);
  const dayWindow = getBusinessDayWindow(now);

  const [rollingRows, dailyUsageResult] = await Promise.all([
    db
      .select({
        completedAt: manualReportSends.completedAt,
      })
      .from(manualReportSends)
      .where(gte(manualReportSends.completedAt, rollingWindowStart))
      .orderBy(asc(manualReportSends.completedAt)),
    db
      .select({
        recipientCount: sql<number>`COALESCE(SUM(${manualReportSends.recipientCount}), 0)`,
      })
      .from(manualReportSends)
      .where(and(gte(manualReportSends.completedAt, dayWindow.start), lt(manualReportSends.completedAt, dayWindow.end))),
  ]);

  const rollingWindowUsed = rollingRows.length;
  const oldestInWindow = rollingRows[0]?.completedAt ?? null;
  const blockedUntil =
    rollingWindowUsed >= ROLLING_WINDOW_LIMIT && oldestInWindow
      ? new Date(oldestInWindow.getTime() + ROLLING_WINDOW_MINUTES * 60 * 1000)
      : null;

  return {
    rollingWindowUsed,
    dailyRecipientsUsed: Number(dailyUsageResult[0]?.recipientCount ?? 0),
    blockedUntil,
  };
}

interface AvailabilityInput {
  productCount: number;
  recipientCount?: number;
  now?: Date;
  previewAvailable?: boolean;
}

export async function getManualReportSendAvailability(input: AvailabilityInput): Promise<ManualReportSendAvailability> {
  const usage = await getManualReportUsage(input.now ?? new Date());
  const recipientCount = input.recipientCount ?? 0;
  const previewAvailable = input.previewAvailable ?? true;

  let reason: ManualReportAvailabilityReason = "none";

  if (!previewAvailable) {
    reason = "preview-unavailable";
  } else if (input.productCount === 0) {
    reason = "no-active-products";
  } else if (usage.rollingWindowUsed >= ROLLING_WINDOW_LIMIT) {
    reason = "rolling-window-limit";
  } else if (usage.dailyRecipientsUsed + recipientCount > DAILY_RECIPIENT_LIMIT) {
    reason = "daily-recipient-limit";
  }

  return {
    canSend: reason === "none",
    rollingWindowUsed: usage.rollingWindowUsed,
    rollingWindowLimit: ROLLING_WINDOW_LIMIT,
    dailyRecipientsUsed: usage.dailyRecipientsUsed,
    dailyRecipientsLimit: DAILY_RECIPIENT_LIMIT,
    blockedUntil: usage.blockedUntil,
    reason,
  };
}

export async function recordCompletedManualReportSend(params: {
  recipientCount: number;
  previewGeneratedAt: Date;
  providerMessageId: string | null;
}) {
  await db.insert(manualReportSends).values({
    recipientCount: params.recipientCount,
    previewGeneratedAt: params.previewGeneratedAt,
    providerMessageId: params.providerMessageId,
    completedAt: new Date(),
  });
}

export async function withManualReportSendLock<T>(work: () => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const acquired = await redisConnection.set(SEND_LOCK_KEY, token, "PX", SEND_LOCK_TTL_MS, "NX");

  if (acquired !== "OK") {
    return null;
  }

  try {
    return await work();
  } finally {
    await redisConnection.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      SEND_LOCK_KEY,
      token,
    );
  }
}
