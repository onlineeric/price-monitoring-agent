import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * scrapeProduct is the orchestrator behind the 2-tier extraction pipeline.
 * Behaviour we lock here:
 *   1) FORCE_AI_EXTRACTION skips the HTML tier entirely (debug switch)
 *   2) HTML success + complete data short-circuits before Playwright
 *   3) HTML success but missing fields → still falls through to Playwright
 *   4) HTML failure → Playwright is invoked
 */

const htmlMock = vi.hoisted(() => ({ fetchAndParse: vi.fn() }));
const playwrightMock = vi.hoisted(() => ({
  playwrightFetch: vi.fn(),
  closeBrowser: vi.fn(),
}));

vi.mock("./htmlFetcher.js", () => htmlMock);
vi.mock("./playwrightFetcher.js", () => playwrightMock);

import { scrapeProduct } from "./scraper";

const ORIGINAL_FORCE_AI = process.env.FORCE_AI_EXTRACTION;

beforeEach(() => {
  htmlMock.fetchAndParse.mockReset();
  playwrightMock.playwrightFetch.mockReset();
  delete process.env.FORCE_AI_EXTRACTION;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_FORCE_AI === undefined) delete process.env.FORCE_AI_EXTRACTION;
  else process.env.FORCE_AI_EXTRACTION = ORIGINAL_FORCE_AI;
  vi.restoreAllMocks();
});

describe("scrapeProduct", () => {
  it("returns the HTML result directly when it has all required fields (Tier-1 short-circuit)", async () => {
    htmlMock.fetchAndParse.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "x", price: 100, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await scrapeProduct("https://shop/x");

    expect(result.method).toBe("html");
    expect(playwrightMock.playwrightFetch).not.toHaveBeenCalled();
  });

  it("falls through to Playwright when HTML succeeds but the data is incomplete", async () => {
    htmlMock.fetchAndParse.mockResolvedValueOnce({
      success: true,
      method: "html",
      data: { title: "x", price: 100, currency: "USD", imageUrl: null }, // imageUrl missing
    });
    playwrightMock.playwrightFetch.mockResolvedValueOnce({
      success: true,
      method: "playwright",
      data: { title: "x", price: 100, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await scrapeProduct("https://shop/x");

    expect(playwrightMock.playwrightFetch).toHaveBeenCalledWith("https://shop/x");
    expect(result.method).toBe("playwright");
  });

  it("falls through to Playwright when HTML fails", async () => {
    htmlMock.fetchAndParse.mockResolvedValueOnce({ success: false, error: "boom", method: "html" });
    playwrightMock.playwrightFetch.mockResolvedValueOnce({
      success: true,
      method: "playwright-ai",
      data: { title: "x", price: 100, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await scrapeProduct("https://shop/x");

    expect(playwrightMock.playwrightFetch).toHaveBeenCalled();
    expect(result.method).toBe("playwright-ai");
  });

  it("returns the Playwright failure when the whole pipeline strikes out", async () => {
    htmlMock.fetchAndParse.mockResolvedValueOnce({ success: false, error: "boom", method: "html" });
    playwrightMock.playwrightFetch.mockResolvedValueOnce({
      success: false,
      method: "playwright",
      error: "browser exited",
    });

    const result = await scrapeProduct("https://shop/x");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toBe("browser exited");
  });

  it("skips the HTML tier entirely when FORCE_AI_EXTRACTION=true (debug-mode contract)", async () => {
    process.env.FORCE_AI_EXTRACTION = "true";
    playwrightMock.playwrightFetch.mockResolvedValueOnce({
      success: true,
      method: "playwright-ai",
      data: { title: "x", price: 100, currency: "USD", imageUrl: "https://cdn/x.jpg" },
    });

    const result = await scrapeProduct("https://shop/x");

    expect(htmlMock.fetchAndParse).not.toHaveBeenCalled();
    expect(playwrightMock.playwrightFetch).toHaveBeenCalledWith("https://shop/x");
    expect(result.method).toBe("playwright-ai");
  });
});
