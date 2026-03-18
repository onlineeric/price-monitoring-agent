import type { ReportSnapshotItem } from "@price-monitor/reporting";

export type ManualReportAvailabilityReason =
  | "none"
  | "no-active-products"
  | "rolling-window-limit"
  | "daily-recipient-limit"
  | "preview-unavailable";

export interface ManualReportPreviewPayload {
  previewId: string;
  generatedAt: string;
  subject: string;
  html: string;
  productCount: number;
  items: ReportSnapshotItem[];
}

export interface ManualReportSendAvailabilityPayload {
  canSend: boolean;
  rollingWindowUsed: number;
  rollingWindowLimit: number;
  dailyRecipientsUsed: number;
  dailyRecipientsLimit: number;
  blockedUntil: string | null;
  reason: ManualReportAvailabilityReason;
}
