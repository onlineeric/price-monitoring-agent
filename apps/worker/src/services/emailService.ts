import { sendPriceReportEmail, type ReportSnapshotItem } from "@price-monitor/reporting";

// Re-export the type for consumers
export type ProductDigestItem = ReportSnapshotItem;

/**
 * Parameters for sending digest email
 */
export interface SendDigestParams {
  to: string;
  products: ProductDigestItem[];
  generatedAt?: Date;
}

/**
 * Send a price digest email
 * @returns true if email was sent successfully, false otherwise
 */
export async function sendDigestEmail(
  params: SendDigestParams
): Promise<boolean> {
  const result = await sendPriceReportEmail({
    recipients: [params.to],
    generatedAt: params.generatedAt ?? new Date(),
    products: params.products,
  });

  if (!result.success) {
    console.error("[Email] Failed to send digest:", result.errorMessage);
    return false;
  }

  console.log("[Email] Digest sent successfully:", result.providerMessageId);
  return true;
}
