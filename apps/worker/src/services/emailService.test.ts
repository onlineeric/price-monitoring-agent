import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendDigestEmail is a thin adapter over @price-monitor/reporting. The
 * contract we lock here: it always passes [to] as a single-element recipient
 * array, defaults generatedAt to now, and returns true/false based on the
 * underlying provider response — without throwing.
 */

const reportingMock = vi.hoisted(() => ({ sendPriceReportEmail: vi.fn() }));
vi.mock("@price-monitor/reporting", () => reportingMock);

import { sendDigestEmail } from "./emailService";

beforeEach(() => {
  reportingMock.sendPriceReportEmail.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendDigestEmail", () => {
  it("returns true and forwards recipient + items when the provider reports success", async () => {
    reportingMock.sendPriceReportEmail.mockResolvedValueOnce({ success: true, providerMessageId: "msg_1" });

    const result = await sendDigestEmail({
      to: "user@example.com",
      products: [{ productId: "p1" }] as never,
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
    });

    expect(result).toBe(true);
    expect(reportingMock.sendPriceReportEmail).toHaveBeenCalledWith({
      recipients: ["user@example.com"],
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      products: [{ productId: "p1" }],
    });
  });

  it("returns false (does not throw) when the provider reports failure", async () => {
    reportingMock.sendPriceReportEmail.mockResolvedValueOnce({ success: false, errorMessage: "boom" });

    const result = await sendDigestEmail({ to: "user@example.com", products: [] });

    expect(result).toBe(false);
  });

  it("defaults generatedAt to the current time when omitted", async () => {
    reportingMock.sendPriceReportEmail.mockResolvedValueOnce({ success: true, providerMessageId: "msg" });

    const before = Date.now();
    await sendDigestEmail({ to: "user@example.com", products: [] });
    const after = Date.now();

    const call = reportingMock.sendPriceReportEmail.mock.calls[0][0] as { generatedAt: Date };
    expect(call.generatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.generatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
