import * as cheerio from "cheerio";
import type { ScraperResult, ScraperConfig } from "../types/scraper.js";
import { parsePrice, resolveImageUrl } from "../utils/priceParser.js";

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  timeout: 10000,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Title extraction selectors (priority order)
const TITLE_SELECTORS = [
  'h1[data-testid="product-title"]',
  "#productTitle", // Amazon
  "h1.product-title",
  'h1[itemprop="name"]',
  ".product-name h1",
  ".product_main h1", // books.toscrape.com
  "h1",
];

// Price extraction selectors (priority order)
const PRICE_SELECTORS = [
  '[data-testid="price"]',
  ".price-current",
  "#priceblock_ourprice", // Amazon
  "#priceblock_dealprice", // Amazon deals
  ".a-price .a-offscreen", // Amazon new format
  ".product-price",
  '[itemprop="price"]',
  ".price_color", // books.toscrape.com
  ".price",
];

// Image extraction selectors (priority order)
const IMAGE_SELECTORS = [
  "#landingImage", // Amazon
  "#imgTagWrapperId img", // Amazon
  '[data-testid="product-image"] img',
  ".product-image img",
  '[itemprop="image"]',
  ".thumbnail img", // books.toscrape.com
  ".gallery img:first",
  ".product_gallery img",
];

/**
 * Extract product data from parsed HTML
 */
function extractProductData($: cheerio.CheerioAPI, baseUrl: string) {
  // Extract title
  let title: string | null = null;
  for (const selector of TITLE_SELECTORS) {
    const element = $(selector).first();
    if (element.length) {
      title = element.text().trim();
      if (title) break;
    }
  }

  // Extract price
  let price: number | null = null;
  let currency: string | null = null;
  for (const selector of PRICE_SELECTORS) {
    const element = $(selector).first();
    if (element.length) {
      const priceText = element.text().trim();
      const parsed = parsePrice(priceText);
      if (parsed) {
        price = parsed.price;
        currency = parsed.currency;
        break;
      }
    }
  }

  // Extract image URL
  let imageUrl: string | null = null;
  for (const selector of IMAGE_SELECTORS) {
    const element = $(selector).first();
    if (element.length) {
      // Try various image attributes
      const rawUrl =
        element.attr("src") ||
        element.attr("data-src") ||
        element.attr("data-old-hires") ||
        null;

      imageUrl = resolveImageUrl(rawUrl, baseUrl);
      if (imageUrl) break;
    }
  }

  return { title, price, currency, imageUrl };
}

/**
 * Fetch a URL and parse the HTML to extract product data
 */
export async function fetchAndParse(
  url: string,
  config?: ScraperConfig
): Promise<ScraperResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), mergedConfig.timeout);

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent": mergedConfig.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check response status
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        method: "html",
      };
    }

    // Get HTML content
    const html = await response.text();

    // Parse with Cheerio
    const $ = cheerio.load(html);

    // Extract product data
    const data = extractProductData($, url);

    // Check if we got all required fields (price, currency, imageUrl are mandatory)
    // Title is optional but nice to have
    if (!data.price || !data.currency || !data.imageUrl) {
      const missing = [];
      if (!data.price) missing.push("price");
      if (!data.currency) missing.push("currency");
      if (!data.imageUrl) missing.push("imageUrl");

      return {
        success: false,
        error: `Could not extract required fields: ${missing.join(", ")}`,
        method: "html",
      };
    }

    return {
      success: true,
      data,
      method: "html",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (errorMessage.includes("abort")) {
      return {
        success: false,
        error: `Request timeout after ${mergedConfig.timeout}ms`,
        method: "html",
      };
    }

    return {
      success: false,
      error: errorMessage,
      method: "html",
    };
  }
}
