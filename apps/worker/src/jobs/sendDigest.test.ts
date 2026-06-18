import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueRefreshFlowForActiveProducts: vi.fn(),
  closeUpdatePricesFlowProducer: vi.fn(),
  buildActiveProductReportSnapshot: vi.fn(),
  sendPriceReportEmail: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("../services/update-prices.js", () => ({
  enqueueRefreshFlowForActiveProducts: mocks.enqueueRefreshFlowForActiveProducts,
  closeUpdatePricesFlowProducer: mocks.closeUpdatePricesFlowProducer,
}));

vi.mock("../services/settingsService.js", () => ({
  setSetting: mocks.setSetting,
}));

vi.mock("@price-monitor/db", () => ({
  SETTING_LAST_BULK_REFRESH_COMPLETED_AT: "last_bulk_refresh_completed_at",
}));

vi.mock("@price-monitor/reporting", () => ({
  buildActiveProductReportSnapshot: mocks.buildActiveProductReportSnapshot,
  sendPriceReportEmail: mocks.sendPriceReportEmail,
}));

import { closeFlowProducer, onDigestFlowComplete, sendDigestJob } from "./sendDigest";

describe("sendDigest job flow", () => {
  it("uses refresh-only update path for manual trigger", async () => {
    mocks.enqueueRefreshFlowForActiveProducts.mockResolvedValue({
      enqueued: true,
      activeProductCount: 2,
    });

    const result = await sendDigestJob({
      id: "job_1",
      name: "send-digest",
    } as never);

    // Manual digest with no mode in the payload defaults to the price refresh.
    expect(mocks.enqueueRefreshFlowForActiveProducts).toHaveBeenCalledWith("manual", "price");
    expect(result).toEqual({
      success: true,
      message: "Enqueued 2 price check jobs",
    });
  });

  it("uses refresh-only update path for scheduled trigger (defaults to price)", async () => {
    mocks.enqueueRefreshFlowForActiveProducts.mockResolvedValue({
      enqueued: true,
      activeProductCount: 1,
    });

    await sendDigestJob({
      id: "job_2",
      name: "send-digest-scheduled",
    } as never);

    expect(mocks.enqueueRefreshFlowForActiveProducts).toHaveBeenCalledWith("scheduled", "price");
  });

  it("propagates mode: info from the job payload to the refresh flow", async () => {
    mocks.enqueueRefreshFlowForActiveProducts.mockResolvedValue({
      enqueued: true,
      activeProductCount: 3,
    });

    await sendDigestJob({
      id: "job_3",
      name: "send-digest",
      data: { mode: "info" },
    } as never);

    expect(mocks.enqueueRefreshFlowForActiveProducts).toHaveBeenCalledWith("manual", "info");
  });

  it("reuses shared reporting helpers in completion callback", async () => {
    process.env.ALERT_EMAIL = "alerts@example.com";

    mocks.buildActiveProductReportSnapshot.mockResolvedValue({
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      items: [{ productId: "p1" }],
      productCount: 1,
    });
    mocks.sendPriceReportEmail.mockResolvedValue({
      success: true,
      providerMessageId: "msg_1",
    });

    const result = await onDigestFlowComplete({
      getChildrenValues: vi.fn().mockResolvedValue({ child: { success: true } }),
    } as never);

    expect(mocks.sendPriceReportEmail).toHaveBeenCalledWith({
      recipients: ["alerts@example.com"],
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      products: [{ productId: "p1" }],
    });
    // Batch-completion marker is stamped so the dashboard can signal a refresh.
    expect(mocks.setSetting).toHaveBeenCalledWith("last_bulk_refresh_completed_at", expect.any(String));
    expect(result).toEqual({
      success: true,
      productCount: 1,
    });
  });

  it("stamps the completion marker even when there are no products to check", async () => {
    mocks.enqueueRefreshFlowForActiveProducts.mockResolvedValue({
      enqueued: false,
      activeProductCount: 0,
    });

    await sendDigestJob({ id: "job_4", name: "send-digest" } as never);

    expect(mocks.setSetting).toHaveBeenCalledWith("last_bulk_refresh_completed_at", expect.any(String));
  });

  it("closes update-prices flow producer on shutdown", async () => {
    await closeFlowProducer();
    expect(mocks.closeUpdatePricesFlowProducer).toHaveBeenCalledTimes(1);
  });
});
