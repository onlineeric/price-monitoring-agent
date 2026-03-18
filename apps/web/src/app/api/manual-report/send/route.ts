import { NextResponse } from "next/server";

import { sendPriceReportEmail } from "@price-monitor/reporting";

import { getManualReportPreview } from "@/lib/manual-report/preview-cache";
import { validateRecipientList } from "@/lib/manual-report/recipient-list";
import {
  getManualReportSendAvailability,
  recordCompletedManualReportSend,
  withManualReportSendLock,
} from "@/lib/manual-report/send-limits";
import {
  isManualReportLedgerMissingError,
  MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE,
  MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/manual-report/storage-errors";

function limitMessage(reason: string): string {
  if (reason === "rolling-window-limit") {
    return "Manual report sending is temporarily limited. Please wait and try again.";
  }

  if (reason === "daily-recipient-limit") {
    return "Manual report recipient quota reached for today.";
  }

  return "Manual report cannot be sent right now.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { previewId?: unknown; recipients?: unknown };
    const previewId = typeof body.previewId === "string" ? body.previewId.trim() : "";
    const rawRecipients = Array.isArray(body.recipients)
      ? body.recipients.filter((value): value is string => typeof value === "string")
      : [];
    const normalizedRecipients = rawRecipients.map((entry) => entry.trim().toLowerCase());
    const validation = validateRecipientList(normalizedRecipients);

    if (!previewId) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_preview_id",
            message: "A valid previewId is required.",
          },
        },
        { status: 400 },
      );
    }

    if (validation.errors.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_recipients",
            message: validation.errors.join(" "),
          },
        },
        { status: 400 },
      );
    }

    const result = await withManualReportSendLock(async () => {
      const preview = await getManualReportPreview(previewId);
      if (!preview) {
        const availability = await getManualReportSendAvailability({
          productCount: 0,
          recipientCount: validation.recipients.length,
          previewAvailable: false,
        });

        return {
          status: 409,
          body: {
            error: {
              code: "preview_unavailable",
              message: "The reviewed preview is no longer available. Please refresh preview and try again.",
            },
            availability: {
              ...availability,
              blockedUntil: availability.blockedUntil?.toISOString() ?? null,
            },
          },
        };
      }

      const availability = await getManualReportSendAvailability({
        productCount: preview.productCount,
        recipientCount: validation.recipients.length,
      });

      if (!availability.canSend) {
        return {
          status: 429,
          body: {
            error: {
              code: availability.reason,
              message: limitMessage(availability.reason),
            },
            availability: {
              ...availability,
              blockedUntil: availability.blockedUntil?.toISOString() ?? null,
            },
          },
        };
      }

      const sendResult = await sendPriceReportEmail({
        recipients: validation.recipients,
        generatedAt: preview.generatedAt,
        products: preview.items,
        subject: preview.subject,
        html: preview.html,
      });

      if (!sendResult.success) {
        return {
          status: 502,
          body: {
            error: {
              code: "provider_send_failed",
              message: sendResult.errorMessage || "Unable to send report email right now.",
            },
          },
        };
      }

      await recordCompletedManualReportSend({
        recipientCount: validation.recipients.length,
        previewGeneratedAt: preview.generatedAt,
        providerMessageId: sendResult.providerMessageId,
      });

      const updatedAvailability = await getManualReportSendAvailability({
        productCount: preview.productCount,
      });

      return {
        status: 200,
        body: {
          success: true,
          recipientCount: validation.recipients.length,
          generatedAt: preview.generatedAt.toISOString(),
          availability: {
            ...updatedAvailability,
            blockedUntil: updatedAvailability.blockedUntil?.toISOString() ?? null,
          },
        },
      };
    });

    if (!result) {
      return NextResponse.json(
        {
          error: {
            code: "send_in_progress",
            message: "Another manual report send is already in progress. Please try again shortly.",
          },
        },
        { status: 429 },
      );
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (isManualReportLedgerMissingError(error)) {
      console.error("[API] Manual report storage is unavailable:", error);
      return NextResponse.json(
        {
          error: {
            code: MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE,
            message: MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE,
          },
        },
        { status: 503 },
      );
    }

    console.error("[API] Failed to send manual report:", error);
    return NextResponse.json(
      {
        error: {
          code: "send_failed",
          message: "Unable to send manual report right now.",
        },
      },
      { status: 500 },
    );
  }
}
