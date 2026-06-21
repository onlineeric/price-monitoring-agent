import { describe, expect, it } from "vitest";

import { renderPriceReport } from "./render-price-report";
import type { ReportSnapshotItem } from "./report-snapshot";

/**
 * renderPriceReport is the orchestrator both web and worker call to turn a
 * snapshot into the {subject, html} pair handed to Resend. The per-piece logic
 * (subject formatting, snapshot math) is covered elsewhere; this test pins the
 * orchestration: a real HTML render that actually contains the product, and a
 * subject wired to the shared builder.
 */

const generatedAt = new Date(2026, 2, 5, 12, 0, 0);

function makeItem(overrides: Partial<ReportSnapshotItem> = {}): ReportSnapshotItem {
  return {
    productId: "prod-1",
    name: "Acme Widget",
    url: "https://example.com/widget",
    imageUrl: "https://cdn.example.com/widget.png",
    currentPrice: 1999,
    currency: "USD",
    lastChecked: generatedAt,
    lastFailed: null,
    vsLastCheck: null,
    vs7dAvg: null,
    vs30dAvg: null,
    vs90dAvg: null,
    vs180dAvg: null,
    ...overrides,
  };
}

describe("renderPriceReport", () => {
  it("returns the locale-formatted subject for the generation date", async () => {
    const { subject } = await renderPriceReport({ generatedAt, products: [makeItem()] });
    expect(subject).toBe("Price Monitor Report - March 5, 2026");
  });

  it("renders HTML that contains the product name", async () => {
    const { html } = await renderPriceReport({ generatedAt, products: [makeItem({ name: "Acme Widget" })] });
    expect(html).toContain("Acme Widget");
    expect(html.toLowerCase()).toContain("<html");
  });

  it("renders successfully with no products (empty digest)", async () => {
    const { subject, html } = await renderPriceReport({ generatedAt, products: [] });
    expect(subject).toContain("Price Monitor Report - ");
    expect(html.toLowerCase()).toContain("<html");
  });
});
