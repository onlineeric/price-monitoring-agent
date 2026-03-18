import { render } from "@react-email/render";

import { PriceDigestEmail, buildPriceReportSubject } from "./price-digest-email";
import type { ReportSnapshotItem } from "./report-snapshot";

export interface RenderPriceReportInput {
  generatedAt: Date;
  products: ReportSnapshotItem[];
}

export interface RenderPriceReportResult {
  subject: string;
  html: string;
}

export async function renderPriceReport(input: RenderPriceReportInput): Promise<RenderPriceReportResult> {
  const subject = buildPriceReportSubject(input.generatedAt);
  const html = await render(
    PriceDigestEmail({
      generatedAt: input.generatedAt,
      products: input.products,
    }),
  );

  return { subject, html };
}
