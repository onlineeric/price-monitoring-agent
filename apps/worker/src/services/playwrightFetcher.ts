import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "playwright";
import type { ScraperResult, ScraperConfig } from "../types/scraper.js";
import { parsePrice, resolveImageUrl } from "../utils/priceParser.js";
import { aiExtract } from "./aiExtractor.js";

// Apply stealth plugin to avoid bot detection
chromium.use(StealthPlugin());

// Singleton browser instance
let browserInstance: Browser | null = null;

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  timeout: 30000, // Longer timeout for browser rendering
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * Configuration for DOM stability detection
 */
interface DOMStabilityConfig {
  maxWaitMs: number;
  quietWindowMs: number;
  checkIntervalMs: number;
  htmlDeltaThreshold: number;
}

const DOM_STABILITY_CONFIG: DOMStabilityConfig = {
  maxWaitMs: parseInt(process.env.PLAYWRIGHT_MAX_WAIT_MS || "15000", 10),
  quietWindowMs: parseInt(process.env.PLAYWRIGHT_QUIET_WINDOW_MS || "1500", 10),
  checkIntervalMs: 200,
  htmlDeltaThreshold: 200,
};

/**
 * Raw data extracted from page selectors
 */
interface ExtractedData {
  title: string | null;
  priceText: string | null;
  imageUrl: string | null;
}

// Selectors for extracting product data
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
 * Uses playwright-extra with stealth plugin to bypass bot detection
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    console.log("[Playwright] Launching browser with stealth mode...");
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
 * Wait for DOM to stabilize by monitoring HTML size changes
 * Returns when DOM size changes are below threshold for the quiet window duration
 */
async function waitForDOMStability(
  page: Page,
  config: DOMStabilityConfig = DOM_STABILITY_CONFIG
): Promise<void> {
  console.log(`[Playwright] Waiting for DOM stability...`);

  const startTime = Date.now();
  let lastHtmlSize = 0;
  let stableStartTime: number | null = null;

  while (Date.now() - startTime < config.maxWaitMs) {
    const currentHtmlSize = (await page.content()).length;
    const htmlDelta = Math.abs(currentHtmlSize - lastHtmlSize);

    if (htmlDelta <= config.htmlDeltaThreshold) {
      // DOM appears stable
      if (stableStartTime === null) {
        stableStartTime = Date.now();
      } else if (Date.now() - stableStartTime >= config.quietWindowMs) {
        // Stability persisted for quiet window
        console.log(
          `[Playwright] DOM stable after ${Date.now() - startTime}ms (size: ${currentHtmlSize} chars)`
        );
        return;
      }
    } else {
      // DOM still changing, reset stability timer
      stableStartTime = null;
    }

    lastHtmlSize = currentHtmlSize;
    await page.waitForTimeout(config.checkIntervalMs);
  }

  // Stability never reached within maxWaitMs, proceed anyway
  console.log(
    `[Playwright] DOM did not stabilize within ${config.maxWaitMs}ms, proceeding with current content`
  );
}

/**
 * Extract product data from page using CSS selectors
 * Runs in browser context via page.evaluate()
 * Uses inline logic (no helper functions) to avoid esbuild __name helper injection
 */
async function extractDataWithSelectors(page: Page): Promise<ExtractedData> {
  return await page.evaluate((sels) => {
    // Extract title - inline logic without helper functions
    let titleText: string | null = null;
    for (const sel of sels.title) {
      const el = document.querySelector(sel);
      if (el?.textContent) {
        titleText = el.textContent.trim();
        if (titleText) break;
      }
    }

    // Extract price - inline logic without helper functions
    let priceText: string | null = null;
    for (const sel of sels.price) {
      const el = document.querySelector(sel);
      if (el?.textContent) {
        priceText = el.textContent.trim();
        if (priceText) break;
      }
    }

    // Extract image - inline logic without helper functions
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
}

/**
 * Check if debug mode is enabled for forcing AI extraction
 */
function isForceAIEnabled(): boolean {
  return process.env.FORCE_AI_EXTRACTION === "true";
}

/**
 * Check if selector extraction was successful
 * Requires BOTH title and price to be present
 */
function hasValidData(title: string | null, price: number | null, imageUrl: string | null): boolean {
  return title !== null && price !== null && imageUrl !== null;
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
    page = await browser.newPage();

    // Configure page
    await page.setExtraHTTPHeaders({ "User-Agent": mergedConfig.userAgent });
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to URL
    console.log(`[Playwright] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: mergedConfig.timeout,
    });

    // Wait for DOM to stabilize
    await waitForDOMStability(page);

    // Get fully-rendered HTML
    const renderedHtml = await page.content();
    console.log(`[Playwright] Final HTML size: ${renderedHtml.length} chars`);

    // Check if force AI mode is enabled
    const forceAI = isForceAIEnabled();
    if (forceAI) {
      console.log(`[Playwright] 🧪 FORCE_AI_EXTRACTION enabled - skipping selectors, using AI`);
      await page.close();
      page = null;
      return await aiExtract(url, renderedHtml);
    }

    // Extract data using selectors
    console.log(`[Playwright] Attempting selector-based extraction...`);
    const rawData = await extractDataWithSelectors(page);
    console.log(`[Playwright] Selector results - title: ${rawData.title ? 'found' : 'null'}, priceText: ${rawData.priceText ? 'found' : 'null'}, imageUrl: ${rawData.imageUrl ? 'found' : 'null'}`);

    // Parse price from extracted text
    let price: number | null = null;
    let currency: string | null = null;
    if (rawData.priceText) {
      const parsed = parsePrice(rawData.priceText);
      if (parsed) {
        price = parsed.price;
        currency = parsed.currency;
        console.log(`[Playwright] Price parsed: ${price} ${currency}`);
      } else {
        console.log(`[Playwright] Failed to parse price from: "${rawData.priceText}"`);
      }
    }

    // Check if selectors successfully extracted data
    if (!hasValidData(rawData.title, price, rawData.imageUrl)) {
      console.log(`[Playwright] Selectors failed to extract data, trying AI with rendered HTML...`);
      await page.close();
      page = null;
      return await aiExtract(url, renderedHtml);
    }

    // Selector extraction succeeded
    const imageUrl = resolveImageUrl(rawData.imageUrl, url);
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

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
    if (page) {
      await page.close();
    }
  }
}
