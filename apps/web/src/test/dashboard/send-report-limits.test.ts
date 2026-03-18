import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildActiveProductReportSnapshot: vi.fn(),
  renderPriceReport: vi.fn(),
  sendPriceReportEmail: vi.fn(),
  cacheManualReportPreview: vi.fn(),
  getManualReportPreview: vi.fn(),
  getManualReportSendAvailability: vi.fn(),
  recordCompletedManualReportSend: vi.fn(),
  withManualReportSendLock: vi.fn(),
}));

vi.mock("@price-monitor/reporting", () => ({
  buildActiveProductReportSnapshot: mocks.buildActiveProductReportSnapshot,
  renderPriceReport: mocks.renderPriceReport,
  sendPriceReportEmail: mocks.sendPriceReportEmail,
}));

vi.mock("@/lib/manual-report/preview-cache", () => ({
  cacheManualReportPreview: mocks.cacheManualReportPreview,
  getManualReportPreview: mocks.getManualReportPreview,
}));

vi.mock("@/lib/manual-report/send-limits", () => ({
  getManualReportSendAvailability: mocks.getManualReportSendAvailability,
  recordCompletedManualReportSend: mocks.recordCompletedManualReportSend,
  withManualReportSendLock: mocks.withManualReportSendLock,
}));

import { GET } from "@/app/api/manual-report/preview/route";
import { POST } from "@/app/api/manual-report/send/route";

function createMissingManualReportLedgerError() {
  return {
    message:
      'Failed query: select "completed_at" from "manual_report_sends" where "manual_report_sends"."completed_at" >= $1',
    query:
      'select "completed_at" from "manual_report_sends" where "manual_report_sends"."completed_at" >= $1 order by "manual_report_sends"."completed_at" asc',
    cause: {
      code: "42P01",
      message: 'relation "manual_report_sends" does not exist',
    },
  };
}

describe("manual report preview/send contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withManualReportSendLock.mockImplementation(async (work: () => Promise<unknown>) => work());
  });

  it("returns reviewed HTML preview contract including previewId", async () => {
    mocks.buildActiveProductReportSnapshot.mockResolvedValue({
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.renderPriceReport.mockResolvedValue({
      subject: "Price Digest - March 17, 2026",
      html: "<html><body>reviewed</body></html>",
    });
    mocks.cacheManualReportPreview.mockResolvedValue({
      previewId: "preview_123",
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      subject: "Price Digest - March 17, 2026",
      html: "<html><body>reviewed</body></html>",
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.getManualReportSendAvailability.mockResolvedValue({
      canSend: true,
      rollingWindowUsed: 0,
      rollingWindowLimit: 3,
      dailyRecipientsUsed: 0,
      dailyRecipientsLimit: 99,
      blockedUntil: null,
      reason: "none",
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.preview.previewId).toBe("preview_123");
    expect(json.preview.subject).toBe("Price Digest - March 17, 2026");
    expect(json.preview.html).toContain("reviewed");
    expect(json.availability.reason).toBe("none");
  });

  it("returns setup guidance when manual report ledger table is missing", async () => {
    mocks.buildActiveProductReportSnapshot.mockResolvedValue({
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.renderPriceReport.mockResolvedValue({
      subject: "Price Digest - March 17, 2026",
      html: "<html><body>reviewed</body></html>",
    });
    mocks.cacheManualReportPreview.mockResolvedValue({
      previewId: "preview_ledger_missing",
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      subject: "Price Digest - March 17, 2026",
      html: "<html><body>reviewed</body></html>",
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.getManualReportSendAvailability.mockRejectedValue(createMissingManualReportLedgerError());

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("manual_report_storage_unavailable");
  });

  it("returns rolling-window limit response for direct-send API", async () => {
    mocks.getManualReportPreview.mockResolvedValue({
      previewId: "preview_rolling",
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      subject: "Subject",
      html: "<html />",
      productCount: 2,
      items: [{ productId: "p1" }, { productId: "p2" }],
    });
    mocks.getManualReportSendAvailability.mockResolvedValue({
      canSend: false,
      rollingWindowUsed: 3,
      rollingWindowLimit: 3,
      dailyRecipientsUsed: 10,
      dailyRecipientsLimit: 99,
      blockedUntil: new Date("2026-03-17T08:05:00.000Z"),
      reason: "rolling-window-limit",
    });

    const response = await POST(
      new Request("http://localhost/api/manual-report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: "preview_rolling",
          recipients: ["one@example.com"],
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe("rolling-window-limit");
    expect(json.availability.rollingWindowUsed).toBe(3);
    expect(mocks.sendPriceReportEmail).not.toHaveBeenCalled();
  });

  it("sends exactly the reviewed preview artifact by previewId on success", async () => {
    mocks.getManualReportPreview.mockResolvedValue({
      previewId: "preview_parity",
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      subject: "Reviewed Subject",
      html: "<html><body>reviewed-html</body></html>",
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.getManualReportSendAvailability
      .mockResolvedValueOnce({
        canSend: true,
        rollingWindowUsed: 1,
        rollingWindowLimit: 3,
        dailyRecipientsUsed: 20,
        dailyRecipientsLimit: 99,
        blockedUntil: null,
        reason: "none",
      })
      .mockResolvedValueOnce({
        canSend: true,
        rollingWindowUsed: 2,
        rollingWindowLimit: 3,
        dailyRecipientsUsed: 22,
        dailyRecipientsLimit: 99,
        blockedUntil: null,
        reason: "none",
      });
    mocks.sendPriceReportEmail.mockResolvedValue({
      success: true,
      providerMessageId: "msg_1",
    });

    const response = await POST(
      new Request("http://localhost/api/manual-report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: "preview_parity",
          recipients: ["one@example.com", "two@example.com"],
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.sendPriceReportEmail).toHaveBeenCalledWith({
      recipients: ["one@example.com", "two@example.com"],
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      products: [{ productId: "p1" }],
      subject: "Reviewed Subject",
      html: "<html><body>reviewed-html</body></html>",
    });
    expect(mocks.recordCompletedManualReportSend).toHaveBeenCalledWith({
      recipientCount: 2,
      previewGeneratedAt: new Date("2026-03-17T08:00:00.000Z"),
      providerMessageId: "msg_1",
    });
  });

  it("returns setup guidance when send limit storage is unavailable", async () => {
    mocks.getManualReportPreview.mockResolvedValue({
      previewId: "preview_parity",
      generatedAt: new Date("2026-03-17T08:00:00.000Z"),
      subject: "Reviewed Subject",
      html: "<html><body>reviewed-html</body></html>",
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    mocks.getManualReportSendAvailability.mockRejectedValue(createMissingManualReportLedgerError());

    const response = await POST(
      new Request("http://localhost/api/manual-report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewId: "preview_parity",
          recipients: ["one@example.com"],
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("manual_report_storage_unavailable");
    expect(mocks.sendPriceReportEmail).not.toHaveBeenCalled();
  });
});
