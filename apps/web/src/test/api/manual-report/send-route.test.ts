import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/manual-report/send is the only route that drops mail to user-
 * supplied addresses. The behaviour we lock here is the gate ordering, not
 * the underlying lib correctness (those have their own tests):
 *   - missing/invalid previewId → 400 / invalid_preview_id
 *   - recipient validation failure → 400 / invalid_recipients
 *   - lock contention (already in progress) → 429 / send_in_progress
 *   - preview missing in Redis → 409 / preview_unavailable
 *   - availability blocked (rolling window) → 429 / rolling-window-limit
 *   - provider failure → 502 / provider_send_failed
 *   - happy path → 200 with success=true + recipientCount + availability
 */

const previewCacheMock = vi.hoisted(() => ({ getManualReportPreview: vi.fn() }));
const recipientListMock = vi.hoisted(() => ({ validateRecipientList: vi.fn() }));
const sendLimitsMock = vi.hoisted(() => ({
  getManualReportSendAvailability: vi.fn(),
  recordCompletedManualReportSend: vi.fn(),
  withManualReportSendLock: vi.fn(),
}));
const reportingMock = vi.hoisted(() => ({ sendPriceReportEmail: vi.fn() }));
const storageErrorsMock = vi.hoisted(() => ({
  isManualReportLedgerMissingError: vi.fn(() => false),
  MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE: "manual_report_storage_unavailable",
  MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE: "missing table",
}));

vi.mock("@/lib/manual-report/preview-cache", () => previewCacheMock);
vi.mock("@/lib/manual-report/recipient-list", () => recipientListMock);
vi.mock("@/lib/manual-report/send-limits", () => sendLimitsMock);
vi.mock("@/lib/manual-report/storage-errors", () => storageErrorsMock);
vi.mock("@price-monitor/reporting", () => reportingMock);

import { POST } from "@/app/api/manual-report/send/route";

function postBody(body: unknown) {
  return new Request("http://test/api/manual-report/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const okAvailability = {
  canSend: true,
  rollingWindowUsed: 0,
  rollingWindowLimit: 5,
  dailyRecipientsUsed: 0,
  dailyRecipientsLimit: 99,
  blockedUntil: null,
  reason: "none" as const,
};

beforeEach(() => {
  previewCacheMock.getManualReportPreview.mockReset();
  recipientListMock.validateRecipientList.mockReset();
  sendLimitsMock.getManualReportSendAvailability.mockReset();
  sendLimitsMock.recordCompletedManualReportSend.mockReset();
  sendLimitsMock.withManualReportSendLock.mockReset().mockImplementation(async (work) => work());
  reportingMock.sendPriceReportEmail.mockReset();
  storageErrorsMock.isManualReportLedgerMissingError.mockReset().mockReturnValue(false);
  recipientListMock.validateRecipientList.mockReturnValue({ recipients: ["a@x.com"], errors: [] });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/manual-report/send — early gates", () => {
  it("returns 400 / invalid_preview_id when previewId is missing", async () => {
    const response = await POST(postBody({ recipients: ["a@x.com"] }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_preview_id");
  });

  it("returns 400 / invalid_recipients when the recipient list fails validation", async () => {
    recipientListMock.validateRecipientList.mockReturnValueOnce({
      recipients: [],
      errors: ["At least one"],
    });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: [] }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_recipients");
  });
});

describe("POST /api/manual-report/send — concurrency lock", () => {
  it("returns 429 / send_in_progress when another send already holds the lock", async () => {
    sendLimitsMock.withManualReportSendLock.mockResolvedValueOnce(null);

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("send_in_progress");
  });
});

describe("POST /api/manual-report/send — under the lock", () => {
  it("returns 409 / preview_unavailable when the preview key has expired", async () => {
    previewCacheMock.getManualReportPreview.mockResolvedValueOnce(null);
    sendLimitsMock.getManualReportSendAvailability.mockResolvedValueOnce({
      ...okAvailability,
      canSend: false,
      reason: "preview-unavailable",
    });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("preview_unavailable");
  });

  it("returns 429 with the availability reason when send-limits says blocked", async () => {
    previewCacheMock.getManualReportPreview.mockResolvedValueOnce({
      previewId: "preview_xyz",
      generatedAt: new Date(),
      subject: "s",
      html: "<html />",
      productCount: 1,
      items: [],
    });
    sendLimitsMock.getManualReportSendAvailability.mockResolvedValueOnce({
      ...okAvailability,
      canSend: false,
      reason: "rolling-window-limit",
      blockedUntil: new Date("2026-03-17T09:10:00.000Z"),
    });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe("rolling-window-limit");
    expect(json.availability.blockedUntil).toBe("2026-03-17T09:10:00.000Z");
  });

  it("returns 502 / provider_send_failed when Resend reports failure", async () => {
    previewCacheMock.getManualReportPreview.mockResolvedValueOnce({
      previewId: "preview_xyz",
      generatedAt: new Date(),
      subject: "s",
      html: "<html />",
      productCount: 1,
      items: [],
    });
    sendLimitsMock.getManualReportSendAvailability.mockResolvedValue(okAvailability);
    reportingMock.sendPriceReportEmail.mockResolvedValueOnce({ success: false, errorMessage: "rate limited" });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("provider_send_failed");
    expect(sendLimitsMock.recordCompletedManualReportSend).not.toHaveBeenCalled();
  });

  it("records the send and returns 200 on the happy path", async () => {
    const generatedAt = new Date("2026-03-17T09:00:00.000Z");
    previewCacheMock.getManualReportPreview.mockResolvedValueOnce({
      previewId: "preview_xyz",
      generatedAt,
      subject: "s",
      html: "<html />",
      productCount: 1,
      items: [{ productId: "p1" }],
    });
    sendLimitsMock.getManualReportSendAvailability.mockResolvedValue(okAvailability);
    reportingMock.sendPriceReportEmail.mockResolvedValueOnce({ success: true, providerMessageId: "msg_1" });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      recipientCount: 1,
      generatedAt: "2026-03-17T09:00:00.000Z",
    });
    expect(sendLimitsMock.recordCompletedManualReportSend).toHaveBeenCalledWith(
      expect.objectContaining({ recipientCount: 1, providerMessageId: "msg_1" }),
    );
  });
});

describe("POST /api/manual-report/send — outer error handling", () => {
  it("returns 503 / manual_report_storage_unavailable when the ledger table is missing", async () => {
    sendLimitsMock.withManualReportSendLock.mockImplementationOnce(async () => {
      throw new Error("missing table");
    });
    storageErrorsMock.isManualReportLedgerMissingError.mockReturnValue(true);

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("manual_report_storage_unavailable");
  });

  it("returns 500 / send_failed on other unhandled errors", async () => {
    sendLimitsMock.withManualReportSendLock.mockImplementationOnce(async () => {
      throw new Error("boom");
    });

    const response = await POST(postBody({ previewId: "preview_xyz", recipients: ["a@x.com"] }));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("send_failed");
  });
});
