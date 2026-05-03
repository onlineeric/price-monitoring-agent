import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * priceCheck is the per-product job processor — it owns the contract between
 * the URL/productId payload and the side-effects on `products`, `priceRecords`,
 * and `runLogs`. The scraper and database modules are mocked because we are
 * testing the orchestration logic, not the HTTP / Postgres backends.
 */

const dbMocks = vi.hoisted(() => ({
  savePriceRecord: vi.fn(),
  updateProductTimestamp: vi.fn(),
  updateProductFailure: vi.fn(),
  logRun: vi.fn(),
  getProductById: vi.fn(),
  getOrCreateProductByUrl: vi.fn(),
}));

const scraperMocks = vi.hoisted(() => ({
  scrapeProduct: vi.fn(),
}));

vi.mock("../services/database.js", () => dbMocks);
vi.mock("../services/scraper.js", () => scraperMocks);

import priceCheckJob from "./priceCheck";

function makeJob(data: { url?: string; productId?: string }, id = "job-1"): Job {
  return { id, data } as unknown as Job;
}

beforeEach(() => {
  for (const m of Object.values(dbMocks)) m.mockReset();
  scraperMocks.scrapeProduct.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("priceCheckJob — happy path", () => {
  it("scrapes, upserts the product, writes the price record, and stamps lastSuccess", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "Widget", price: 1999, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-1", url: "https://shop/x" });

    const result = await priceCheckJob(makeJob({ url: "https://shop/x" }));

    expect(scraperMocks.scrapeProduct).toHaveBeenCalledWith("https://shop/x");
    expect(dbMocks.getOrCreateProductByUrl).toHaveBeenCalledWith(
      "https://shop/x",
      "Widget",
      "https://cdn/x.jpg",
    );
    expect(dbMocks.savePriceRecord).toHaveBeenCalledWith({ productId: "prod-1", price: 1999, currency: "USD" });
    expect(dbMocks.updateProductTimestamp).toHaveBeenCalledWith("prod-1");
    expect(dbMocks.logRun).toHaveBeenCalledWith({ productId: "prod-1", status: "SUCCESS" });
    // Result type is a discriminated union of ScraperResult | { status: "skipped" }
    expect("success" in result && result.success).toBe(true);
  });
});

describe("priceCheckJob — payload resolution", () => {
  it("looks up URL by productId when no url is in the job (legacy flow)", async () => {
    dbMocks.getProductById.mockResolvedValueOnce({ id: "prod-2", url: "https://shop/y" });
    scraperMocks.scrapeProduct.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "Y", price: 100, currency: "USD", imageUrl: "https://cdn/y.jpg" },
    });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-2", url: "https://shop/y" });

    await priceCheckJob(makeJob({ productId: "prod-2" }));

    expect(dbMocks.getProductById).toHaveBeenCalledWith("prod-2");
    expect(scraperMocks.scrapeProduct).toHaveBeenCalledWith("https://shop/y");
  });

  it("returns a structured 'skipped' result when neither url nor productId resolves", async () => {
    const result = await priceCheckJob(makeJob({}));
    expect(result).toEqual({ status: "skipped", reason: "no_url" });
    expect(scraperMocks.scrapeProduct).not.toHaveBeenCalled();
  });
});

describe("priceCheckJob — failure handling", () => {
  it("returns the scraper failure verbatim and stamps lastFailed when productId is known", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({
      success: false,
      error: "HTTP 503",
      method: "html",
    });

    const result = await priceCheckJob(makeJob({ productId: "prod-3", url: "https://shop/z" }));

    expect(result).toEqual({ success: false, error: "HTTP 503", method: "html" });
    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-3");
    expect(dbMocks.logRun).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "prod-3", status: "FAILED", errorMessage: "HTTP 503" }),
    );
  });

  it("does NOT touch the failure stats when there's no productId to attribute them to", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({ success: false, error: "boom", method: "html" });
    await priceCheckJob(makeJob({ url: "https://shop/no-id" }));
    expect(dbMocks.updateProductFailure).not.toHaveBeenCalled();
    expect(dbMocks.logRun).not.toHaveBeenCalled();
  });

  it("throws and logs a FAILED run when scraper returns success without data", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({ success: true, method: "html" });
    await expect(priceCheckJob(makeJob({ productId: "prod-4", url: "https://shop/q" }))).rejects.toThrow(
      /No data/,
    );
    expect(dbMocks.logRun).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "prod-4", status: "FAILED" }),
    );
  });

  it("throws and logs FAILED when required price/currency are missing from the scrape", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "x", price: null, currency: null, imageUrl: null },
    });
    await expect(priceCheckJob(makeJob({ productId: "prod-5", url: "https://shop/p" }))).rejects.toThrow(
      /Incomplete data: missing price, currency/,
    );
    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-5");
  });

  it("re-throws DB errors after attempting failure logging — surfaces issues to BullMQ retry", async () => {
    scraperMocks.scrapeProduct.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "Widget", price: 100, currency: "USD", imageUrl: null },
    });
    dbMocks.getOrCreateProductByUrl.mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      priceCheckJob(makeJob({ productId: "prod-6", url: "https://shop/q" })),
    ).rejects.toThrow("connection refused");
    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-6");
  });
});
