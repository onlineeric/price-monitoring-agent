import { chromium, type Browser, type Page } from "playwright";
import type { ScraperResult, ScraperConfig } from "../types/scraper.js";
import { parsePrice, resolveImageUrl } from "../utils/priceParser.js";

// Singleton browser instance
let browserInstance: Browser | null = null;

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  timeout: 30000, // Longer timeout for browser rendering
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Selectors passed to page.evaluate() - defined here to keep code organized
const SELECTORS = {
  title: [
    'h1[data-testid="product-title"]',
    "#productTitle",
    "h1.product-title",
    'h1[itemprop="name"]',
    ".product-name h1",
    ".product_main h1",
    "h1",
  ],
  price: [
    '[data-testid="price"]',
    ".price-current",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".a-price .a-offscreen",
    ".product-price",
    '[itemprop="price"]',
    ".price_color",
    ".price",
  ],
  image: [
    "#landingImage",
    "#imgTagWrapperId img",
    '[data-testid="product-image"] img',
    ".product-image img",
    '[itemprop="image"]',
    ".thumbnail img",
    ".gallery img:first-child",
    ".product_gallery img",
  ],
};

/**
 * Get or create the singleton browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    console.log("[Playwright] Launching browser...");
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Important for Docker
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

/**
 * Close the browser instance (for graceful shutdown)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    console.log("[Playwright] Closing browser...");
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch and extract product data using Playwright headless browser
 */
export async function playwrightFetch(
  url: string,
  config?: ScraperConfig
): Promise<ScraperResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let page: Page | null = null;

  try {
    const browser = await getBrowser();

    // Create new page
    page = await browser.newPage();

    // Set user agent
    await page.setExtraHTTPHeaders({
      "User-Agent": mergedConfig.userAgent,
    });

    // Set viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to URL
    console.log(`[Playwright] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: mergedConfig.timeout,
    });

    // Wait a bit more for dynamic content
    await page.waitForTimeout(1500);

    // Extract data from page using page.evaluate with selectors passed as argument
    // This avoids TypeScript transpilation issues with __name helper
    const rawData = await page.evaluate((sels) => {
      // Find first matching element from a list of selectors
      let titleText: string | null = null;
      for (const sel of sels.title) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          titleText = el.textContent.trim();
          if (titleText) break;
        }
      }

      let priceText: string | null = null;
      for (const sel of sels.price) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          priceText = el.textContent.trim();
          if (priceText) break;
        }
      }

      let imageUrl: string | null = null;
      for (const sel of sels.image) {
        const el = document.querySelector(sel) as HTMLImageElement | null;
        if (el) {
          imageUrl =
            el.src ||
            el.getAttribute("data-src") ||
            el.getAttribute("data-old-hires") ||
            null;
          if (imageUrl) break;
        }
      }

      return { title: titleText, priceText, imageUrl };
    }, SELECTORS);

    // Parse price
    let price: number | null = null;
    let currency: string | null = null;
    if (rawData.priceText) {
      const parsed = parsePrice(rawData.priceText);
      if (parsed) {
        price = parsed.price;
        currency = parsed.currency;
      }
    }

    // Resolve image URL
    const imageUrl = resolveImageUrl(rawData.imageUrl, url);

    // Check if we got meaningful data
    if (!rawData.title && !price) {
      return {
        success: false,
        error: "Could not extract product data - no title or price found",
        method: "playwright",
      };
    }

    return {
      success: true,
      data: {
        title: rawData.title,
        price,
        currency,
        imageUrl,
      },
      method: "playwright",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (errorMessage.includes("Timeout") || errorMessage.includes("timeout")) {
      return {
        success: false,
        error: `Navigation timeout after ${mergedConfig.timeout}ms`,
        method: "playwright",
      };
    }

    return {
      success: false,
      error: errorMessage,
      method: "playwright",
    };
  } finally {
    // Always close the page (not the browser)
    if (page) {
      await page.close();
    }
  }
}
