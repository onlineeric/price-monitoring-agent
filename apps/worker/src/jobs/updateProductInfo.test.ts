import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * updateProductInfo is the rich-metadata job processor. It owns the contract:
 * on success it appends a price AND overwrites all metadata (blanking missing
 * fields) + stamps info_updated_at; on total failure it leaves metadata and
 * info_updated_at untouched and records the failure. The scraper + database
 * modules are mocked at the boundary so we test orchestration, not Postgres/AI.
 */

const dbMocks = vi.hoisted(() => ({
  getOrCreateProductByUrl: vi.fn(),
  getProductById: vi.fn(),
  getProductByUrl: vi.fn(),
  logRun: vi.fn(),
  savePriceRecord: vi.fn(),
  saveProductInfo: vi.fn(),
  updateProductFailure: vi.fn(),
  updateProductTimestamp: vi.fn(),
}));

const scraperMocks = vi.hoisted(() => ({ scrapeProductInfo: vi.fn() }));

// Feature 008: the success path best-effort enqueues a reindex job. Mock the
// producer at the boundary so no real Redis connection is opened in tests.
const producerMocks = vi.hoisted(() => ({ enqueueReindex: vi.fn() }));

vi.mock("../services/database.js", () => dbMocks);
vi.mock("../services/scraper.js", () => scraperMocks);
vi.mock("../queue/producer.js", () => producerMocks);

import updateProductInfoJob from "./updateProductInfo";

function makeJob(data: { url?: string; productId?: string }, id = "job-1"): Job {
  return { id, data } as unknown as Job;
}

const FULL_DATA = {
  title: "Chef Knife",
  price: 4950,
  currency: "USD",
  imageUrl: "https://cdn/k.jpg",
  description: "An 8-inch chef knife.",
  category: "Kitchen",
  brand: "Acme",
  countryOfOrigin: "Japan",
  attributes: [{ key: "Material", value: "Steel" }],
};

beforeEach(() => {
  for (const m of Object.values(dbMocks)) m.mockReset();
  scraperMocks.scrapeProductInfo.mockReset();
  producerMocks.enqueueReindex.mockReset();
  producerMocks.enqueueReindex.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateProductInfoJob — success (overwrite)", () => {
  it("appends a price, overwrites all metadata, and stamps success", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: true, method: "ai", data: FULL_DATA });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-1", url: "https://shop/k" });

    const result = await updateProductInfoJob(makeJob({ url: "https://shop/k" }));

    expect(scraperMocks.scrapeProductInfo).toHaveBeenCalledWith("https://shop/k");
    expect(dbMocks.getOrCreateProductByUrl).toHaveBeenCalledWith("https://shop/k", "Chef Knife", "https://cdn/k.jpg");
    expect(dbMocks.savePriceRecord).toHaveBeenCalledWith({ productId: "prod-1", price: 4950, currency: "USD" });
    expect(dbMocks.saveProductInfo).toHaveBeenCalledWith("prod-1", {
      description: "An 8-inch chef knife.",
      category: "Kitchen",
      brand: "Acme",
      countryOfOrigin: "Japan",
      attributes: [{ key: "Material", value: "Steel" }],
    });
    expect(dbMocks.updateProductTimestamp).toHaveBeenCalledWith("prod-1");
    expect(dbMocks.logRun).toHaveBeenCalledWith({ productId: "prod-1", status: "SUCCESS" });
    expect("success" in result && result.success).toBe(true);
    // Feature 008: a successful info refresh enqueues exactly one reindex job.
    expect(producerMocks.enqueueReindex).toHaveBeenCalledTimes(1);
    expect(producerMocks.enqueueReindex).toHaveBeenCalledWith("prod-1");
  });

  it("blanks missing metadata fields on a partial page (still a success with a price)", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({
      success: true,
      method: "ai",
      data: {
        title: "Mystery Item",
        price: 999,
        currency: "USD",
        imageUrl: null,
        description: null,
        category: "Misc",
        brand: null,
        countryOfOrigin: null,
        attributes: [],
      },
    });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-2", url: "https://shop/m" });

    await updateProductInfoJob(makeJob({ url: "https://shop/m" }));

    expect(dbMocks.savePriceRecord).toHaveBeenCalledWith({ productId: "prod-2", price: 999, currency: "USD" });
    expect(dbMocks.saveProductInfo).toHaveBeenCalledWith("prod-2", {
      description: null,
      category: "Misc",
      brand: null,
      countryOfOrigin: null,
      attributes: [],
    });
    expect(dbMocks.logRun).toHaveBeenCalledWith({ productId: "prod-2", status: "SUCCESS" });
  });
});

describe("updateProductInfoJob — payload resolution", () => {
  it("looks up the URL by productId when no url is provided (legacy)", async () => {
    dbMocks.getProductById.mockResolvedValueOnce({ id: "prod-3", url: "https://shop/y" });
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: true, method: "ai", data: FULL_DATA });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-3", url: "https://shop/y" });

    await updateProductInfoJob(makeJob({ productId: "prod-3" }));

    expect(dbMocks.getProductById).toHaveBeenCalledWith("prod-3");
    expect(scraperMocks.scrapeProductInfo).toHaveBeenCalledWith("https://shop/y");
  });

  it("skips when neither url nor productId resolves", async () => {
    const result = await updateProductInfoJob(makeJob({}));
    expect(result).toEqual({ status: "skipped", reason: "no_url" });
    expect(scraperMocks.scrapeProductInfo).not.toHaveBeenCalled();
  });
});

describe("updateProductInfoJob — reindex enqueue (feature 008)", () => {
  it("does NOT enqueue a reindex on a total failure (metadata untouched)", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: false, method: "ai", error: "unreachable" });
    dbMocks.getProductByUrl.mockResolvedValueOnce({ id: "prod-f", url: "https://shop/f" });

    await updateProductInfoJob(makeJob({ url: "https://shop/f" }));

    expect(producerMocks.enqueueReindex).not.toHaveBeenCalled();
  });

  it("never fails the metadata/price write when the reindex enqueue throws (FR-015)", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: true, method: "ai", data: FULL_DATA });
    dbMocks.getOrCreateProductByUrl.mockResolvedValueOnce({ id: "prod-1", url: "https://shop/k" });
    producerMocks.enqueueReindex.mockRejectedValueOnce(new Error("redis down"));

    const result = await updateProductInfoJob(makeJob({ url: "https://shop/k" }));

    // The write still succeeded — the enqueue failure is swallowed + logged.
    expect("success" in result && result.success).toBe(true);
    expect(dbMocks.logRun).toHaveBeenCalledWith({ productId: "prod-1", status: "SUCCESS" });
    expect(producerMocks.enqueueReindex).toHaveBeenCalledTimes(1);
  });
});

describe("updateProductInfoJob — total failure (metadata untouched)", () => {
  it("records the failure and never writes metadata when the scrape fails", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: false, method: "ai", error: "unreachable" });
    dbMocks.getProductByUrl.mockResolvedValueOnce({ id: "prod-f", url: "https://shop/f" });

    const result = await updateProductInfoJob(makeJob({ url: "https://shop/f" }));

    expect(result).toEqual({ success: false, method: "ai", error: "unreachable" });
    expect(dbMocks.getProductByUrl).toHaveBeenCalledWith("https://shop/f");
    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-f");
    expect(dbMocks.logRun).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "prod-f", status: "FAILED", errorMessage: "unreachable" }),
    );
    // The whole point: no metadata write, no price write, no info_updated_at stamp.
    expect(dbMocks.saveProductInfo).not.toHaveBeenCalled();
    expect(dbMocks.savePriceRecord).not.toHaveBeenCalled();
    expect(dbMocks.updateProductTimestamp).not.toHaveBeenCalled();
  });

  it("treats a processed-but-priceless page as a failure (throws, metadata untouched)", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({
      success: true,
      method: "ai",
      data: { ...FULL_DATA, price: null },
    });
    dbMocks.getProductByUrl.mockResolvedValueOnce({ id: "prod-np", url: "https://shop/np" });

    await expect(updateProductInfoJob(makeJob({ url: "https://shop/np" }))).rejects.toThrow(/missing price/i);

    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-np");
    expect(dbMocks.saveProductInfo).not.toHaveBeenCalled();
  });

  it("re-throws DB errors after attempting failure logging", async () => {
    scraperMocks.scrapeProductInfo.mockResolvedValueOnce({ success: true, method: "ai", data: FULL_DATA });
    dbMocks.getOrCreateProductByUrl.mockRejectedValueOnce(new Error("connection refused"));
    dbMocks.getProductByUrl.mockResolvedValueOnce({ id: "prod-db", url: "https://shop/k" });

    await expect(updateProductInfoJob(makeJob({ url: "https://shop/k" }))).rejects.toThrow("connection refused");
    expect(dbMocks.updateProductFailure).toHaveBeenCalledWith("prod-db");
  });
});
