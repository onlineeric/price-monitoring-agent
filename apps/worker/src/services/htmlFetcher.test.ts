import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAndParse } from "./htmlFetcher";

/**
 * htmlFetcher is the Tier-1 extraction path — every successful run avoids a
 * Playwright launch (~3-6s and a Chromium dependency). The tests exercise:
 *   1) fetch error handling → structured ScraperResult
 *   2) selector fan-out (Amazon-style, books.toscrape.com-style, generic)
 *   3) "missing required field" guard so partial extracts never reach DB
 */

function htmlResponse(body: string, init: { status?: number; statusText?: string } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAndParse", () => {
  it("returns a structured failure (not throw) when the fetch returns non-OK", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse("nope", { status: 503, statusText: "Bust" }));
    const result = await fetchAndParse("https://shop.example.com/p/1");
    expect(result).toEqual({ success: false, error: "HTTP 503: Bust", method: "html" });
  });

  it("extracts title + price + image from a generic shop layout", async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        `<html><body>
          <h1 class="product-title">Widget</h1>
          <span class="product-price">$19.99</span>
          <div class="product-image"><img src="/img/widget.jpg" /></div>
        </body></html>`,
      ),
    );
    const result = await fetchAndParse("https://shop.example.com/products/widget");
    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error("expected success with data");
    expect(result.data.title).toBe("Widget");
    expect(result.data.price).toBe(1999);
    expect(result.data.currency).toBe("USD");
    expect(result.data.imageUrl).toBe("https://shop.example.com/img/widget.jpg");
    expect(result.method).toBe("html");
  });

  it("recognizes Amazon-style selectors (#productTitle, #priceblock_ourprice, #landingImage)", async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        `<html><body>
          <h1 id="productTitle">A Book</h1>
          <span id="priceblock_ourprice">£12.34</span>
          <img id="landingImage" src="https://images.example.com/book.jpg" />
        </body></html>`,
      ),
    );
    const result = await fetchAndParse("https://www.amazon.com/dp/abc");
    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error("expected success with data");
    expect(result.data.title).toBe("A Book");
    expect(result.data.price).toBe(1234);
    expect(result.data.currency).toBe("GBP");
    expect(result.data.imageUrl).toBe("https://images.example.com/book.jpg");
  });

  it("returns failure with a missing-fields list when required data is absent", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(`<html><body><h1>Just a title</h1></body></html>`));
    const result = await fetchAndParse("https://shop.example.com/x");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("price");
    expect(result.error).toContain("currency");
    expect(result.error).toContain("imageUrl");
  });

  it("classifies AbortError-style failures as a timeout with the configured value", async () => {
    fetchMock.mockRejectedValueOnce(new Error("the operation was aborted"));
    const result = await fetchAndParse("https://shop.example.com/x", { timeout: 5_000 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("5000ms");
  });

  it("propagates the underlying message for other fetch errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const result = await fetchAndParse("https://shop.example.com/x");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toBe("ENOTFOUND");
  });

  it("sends the documented User-Agent header (some shops 403 the default Node UA)", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(`<html><body><h1>x</h1></body></html>`));
    await fetchAndParse("https://shop.example.com/x");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Mozilla/);
  });
});
