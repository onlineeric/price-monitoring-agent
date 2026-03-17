import { NextResponse } from "next/server";

import { buildActiveProductReportSnapshot, renderPriceReport } from "@price-monitor/reporting";

import { cacheManualReportPreview } from "@/lib/manual-report/preview-cache";
import { getManualReportSendAvailability } from "@/lib/manual-report/send-limits";
import {
  isManualReportLedgerMissingError,
  MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE,
  MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/manual-report/storage-errors";

export async function GET() {
  try {
    const report = await buildActiveProductReportSnapshot();
    const rendered = await renderPriceReport({
      generatedAt: report.generatedAt,
      products: report.items,
    });

    const preview = await cacheManualReportPreview({
      generatedAt: report.generatedAt,
      subject: rendered.subject,
      html: rendered.html,
      productCount: report.productCount,
      items: report.items,
    });

    const availability = await getManualReportSendAvailability({
      productCount: preview.productCount,
    });

    return NextResponse.json({
      preview: {
        ...preview,
        generatedAt: preview.generatedAt.toISOString(),
      },
      availability: {
        ...availability,
        blockedUntil: availability.blockedUntil?.toISOString() ?? null,
      },
    });
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

    console.error("[API] Failed to generate manual report preview:", error);

    return NextResponse.json(
      {
        error: {
          code: "preview_generation_failed",
          message: "Unable to generate the current report preview.",
        },
      },
      { status: 500 },
    );
  }
}
