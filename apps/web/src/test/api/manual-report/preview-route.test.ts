import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/manual-report/preview builds the snapshot, caches it in Redis, and
 * returns it alongside the current send availability. The route is a thin
 * orchestrator over @price-monitor/reporting + lib/manual-report — we mock
 * the lib boundary and pin:
 *   - Redis-backed preview-cache call gets the rendered subject + html
 *   - availability.blockedUntil is serialized to an ISO string (or null)
 *   - the manual_report_sends-missing error becomes HTTP 503 with the
 *     storage-unavailable code, not a generic 500 (operator hint)
 */

const reportingMock = vi.hoisted(() => ({
  buildActiveProductReportSnapshot: vi.fn(),
  renderPriceReport: vi.fn(),
}));

const previewCacheMock = vi.hoisted(() => ({ cacheManualReportPreview: vi.fn() }));
const sendLimitsMock = vi.hoisted(() => ({ getManualReportSendAvailability: vi.fn() }));
const storageErrorsMock = vi.hoisted(() => ({
  isManualReportLedgerMissingError: vi.fn(() => false),
  MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE: "manual_report_storage_unavailable",
  MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE: "missing table",
}));

vi.mock("@price-monitor/reporting", () => reportingMock);
vi.mock("@/lib/manual-report/preview-cache", () => previewCacheMock);
vi.mock("@/lib/manual-report/send-limits", () => sendLimitsMock);
vi.mock("@/lib/manual-report/storage-errors", () => storageErrorsMock);

import { GET } from "@/app/api/manual-report/preview/route";

beforeEach(() => {
  reportingMock.buildActiveProductReportSnapshot.mockReset();
  reportingMock.renderPriceReport.mockReset();
  previewCacheMock.cacheManualReportPreview.mockReset();
  sendLimitsMock.getManualReportSendAvailability.mockReset();
  storageErrorsMock.isManualReportLedgerMissingError.mockReset().mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function happyPath() {
  const generatedAt = new Date("2026-03-17T09:00:00.000Z");
  reportingMock.buildActiveProductReportSnapshot.mockResolvedValue({
    generatedAt,
    items: [{ productId: "p1" }],
    productCount: 1,
  });
  reportingMock.renderPriceReport.mockResolvedValue({ subject: "Hello", html: "<html />" });
  previewCacheMock.cacheManualReportPreview.mockImplementation(async (snapshot) => ({
    ...snapshot,
    previewId: "preview_xyz",
  }));
  sendLimitsMock.getManualReportSendAvailability.mockResolvedValue({
    canSend: true,
    rollingWindowUsed: 0,
    rollingWindowLimit: 5,
    dailyRecipientsUsed: 0,
    dailyRecipientsLimit: 99,
    blockedUntil: null,
    reason: "none",
  });
}

describe("GET /api/manual-report/preview", () => {
  it("returns the cached preview + availability on the happy path", async () => {
    happyPath();

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.preview).toMatchObject({
      previewId: "preview_xyz",
      subject: "Hello",
      productCount: 1,
      generatedAt: "2026-03-17T09:00:00.000Z",
    });
    expect(json.availability.canSend).toBe(true);
    expect(json.availability.blockedUntil).toBeNull();
  });

  it("serializes a non-null blockedUntil to an ISO string", async () => {
    happyPath();
    sendLimitsMock.getManualReportSendAvailability.mockResolvedValueOnce({
      canSend: false,
      rollingWindowUsed: 5,
      rollingWindowLimit: 5,
      dailyRecipientsUsed: 0,
      dailyRecipientsLimit: 99,
      blockedUntil: new Date("2026-03-17T09:10:00.000Z"),
      reason: "rolling-window-limit",
    });

    const json = await (await GET()).json();
    expect(json.availability.blockedUntil).toBe("2026-03-17T09:10:00.000Z");
  });

  it("returns HTTP 503 with the storage-unavailable code when the ledger table is missing", async () => {
    reportingMock.buildActiveProductReportSnapshot.mockRejectedValueOnce(new Error("missing table"));
    storageErrorsMock.isManualReportLedgerMissingError.mockReturnValue(true);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error.code).toBe("manual_report_storage_unavailable");
  });

  it("returns HTTP 500 with a generic preview_generation_failed code on other errors", async () => {
    reportingMock.buildActiveProductReportSnapshot.mockRejectedValueOnce(new Error("boom"));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("preview_generation_failed");
  });
});
