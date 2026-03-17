import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@price-monitor/db", () => {
  const products = {
    active: Symbol("active"),
    id: Symbol("id"),
    name: Symbol("name"),
    url: Symbol("url"),
    imageUrl: Symbol("imageUrl"),
    lastSuccessAt: Symbol("lastSuccessAt"),
    lastFailedAt: Symbol("lastFailedAt"),
  };
  const priceRecords = {
    productId: Symbol("productId"),
    scrapedAt: Symbol("scrapedAt"),
    price: Symbol("price"),
    currency: Symbol("currency"),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        if (table === products) {
          return {
            where: vi.fn(async () => [
              {
                id: "active_1",
                name: "Active Product",
                url: "https://example.com/active",
                imageUrl: null,
                lastSuccessAt: new Date("2026-03-17T08:00:00.000Z"),
                lastFailedAt: null,
              },
            ]),
          };
        }

        return {
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => [
              { price: 10000, currency: "USD", scrapedAt: new Date("2026-03-17T08:00:00.000Z") },
              { price: 11000, currency: "USD", scrapedAt: new Date("2026-03-16T08:00:00.000Z") },
            ]),
          })),
        };
      }),
    })),
  };

  return {
    db,
    products,
    priceRecords,
    and: vi.fn(),
    desc: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
  };
});

import {
  __setResendClientForTests,
  buildActiveProductReportSnapshot,
  renderPriceReport,
  sendPriceReportEmail,
} from "@price-monitor/reporting";

describe("shared reporting package", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    sendEmailMock.mockReset();
    __setResendClientForTests({
      emails: {
        send: sendEmailMock,
      },
    });
  });

  it("builds report snapshot from active products", async () => {
    const snapshot = await buildActiveProductReportSnapshot(new Date("2026-03-17T09:00:00.000Z"));

    expect(snapshot.productCount).toBe(1);
    expect(snapshot.items[0]?.productId).toBe("active_1");
    expect(snapshot.items[0]?.name).toBe("Active Product");
  });

  it("renders preview HTML from shared digest template", async () => {
    const rendered = await renderPriceReport({
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      products: [
        {
          productId: "p1",
          name: "Rendered Product",
          url: "https://example.com/rendered",
          imageUrl: null,
          currentPrice: 12345,
          currency: "USD",
          lastChecked: null,
          lastFailed: null,
          vsLastCheck: null,
          vs7dAvg: null,
          vs30dAvg: null,
          vs90dAvg: null,
          vs180dAvg: null,
        },
      ],
    });

    expect(rendered.subject).toContain("Price Monitor Report");
    expect(rendered.html).toContain("Rendered Product");
  });

  it("uses BCC formatting for multi-recipient sends", async () => {
    sendEmailMock.mockResolvedValue({
      data: { id: "msg_123" },
      error: null,
    });

    const result = await sendPriceReportEmail({
      recipients: ["one@example.com", "two@example.com"],
      generatedAt: new Date("2026-03-17T09:00:00.000Z"),
      products: [],
      subject: "Subject",
      html: "<p>Reviewed</p>",
    });

    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bcc: ["one@example.com", "two@example.com"],
      }),
    );
  });
});
