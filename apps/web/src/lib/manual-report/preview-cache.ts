import { randomUUID } from "node:crypto";

import type { ReportSnapshotItem } from "@price-monitor/reporting";
import { z } from "zod";

import { redisConnection } from "@/lib/redis";

const PREVIEW_KEY_PREFIX = "manual-report:preview";
const PREVIEW_TTL_SECONDS = 15 * 60;

export interface ManualReportPreviewSnapshot {
  previewId: string;
  generatedAt: Date;
  subject: string;
  html: string;
  productCount: number;
  items: ReportSnapshotItem[];
}

interface SerializedPreviewSnapshot {
  previewId: string;
  generatedAt: string;
  subject: string;
  html: string;
  productCount: number;
  items: ReportSnapshotItem[];
}

const serializedPreviewSnapshotSchema = z.object({
  previewId: z.string().min(1),
  generatedAt: z.string().datetime(),
  subject: z.string(),
  html: z.string(),
  productCount: z.number().int().min(0),
  items: z.array(z.object({ productId: z.string(), url: z.string() }).passthrough()),
});

function getPreviewKey(previewId: string) {
  return `${PREVIEW_KEY_PREFIX}:${previewId}`;
}

function serializePreview(snapshot: ManualReportPreviewSnapshot): SerializedPreviewSnapshot {
  return {
    ...snapshot,
    generatedAt: snapshot.generatedAt.toISOString(),
  };
}

function deserializePreview(snapshot: SerializedPreviewSnapshot): ManualReportPreviewSnapshot {
  return {
    ...snapshot,
    generatedAt: new Date(snapshot.generatedAt),
  };
}

export async function cacheManualReportPreview(
  preview: Omit<ManualReportPreviewSnapshot, "previewId">,
): Promise<ManualReportPreviewSnapshot> {
  const previewId = `preview_${randomUUID()}`;
  const snapshot: ManualReportPreviewSnapshot = {
    ...preview,
    previewId,
  };

  await redisConnection.set(
    getPreviewKey(previewId),
    JSON.stringify(serializePreview(snapshot)),
    "EX",
    PREVIEW_TTL_SECONDS,
  );

  return snapshot;
}

export async function getManualReportPreview(previewId: string): Promise<ManualReportPreviewSnapshot | null> {
  const value = await redisConnection.get(getPreviewKey(previewId));
  if (!value) {
    return null;
  }

  try {
    const parsed = serializedPreviewSnapshotSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      return null;
    }
    return deserializePreview(parsed.data as SerializedPreviewSnapshot);
  } catch {
    return null;
  }
}
