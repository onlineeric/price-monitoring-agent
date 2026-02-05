import type { ScraperResult } from "../types/scraper.js";
import { aiExtract } from "./aiExtractor.js";

/**
 * Check if debug logging is enabled
 */
function isDebugEnabled(): boolean {
  return process.env.DEBUG_LOG === "true";
}

/**
 * Log debug message if debug mode is enabled
 */
function debugLog(message: string): void {
  if (isDebugEnabled()) {
    console.log(`[debug] [BrowserQL] ${message}`);
  }
}

/**
 * Get BrowserQL timeout from environment (default: 30000ms)
 */
function getTimeout(): number {
  return parseInt(process.env.BROWSERLESS_TIMEOUT || "30000", 10);
}

/**
 * Build BrowserQL GraphQL query
 * Note: URL is interpolated directly into the query string (not as a variable)
 */
function buildBQLQuery(url: string, timeout: number): string {
  return `
mutation GetPageData {
  viewport(width: 1366, height: 768) {
    width
    height
    time
  }
  goto(
    url: "${url}"
    waitUntil: load
    ,timeout: ${timeout}
  ) {
    status
  }
  pageContent: html(
    clean: {
      removeNonTextNodes: false
      removeAttributes: true
      removeRegex: true
    }
  ) {
    html
  }
}
`;
}

/**
 * Response shape from BrowserQL API
 */
interface BrowserQLResponse {
  data?: {
    viewport?: { width: number; height: number; time: number };
    goto?: { status: number };
    pageContent?: { html: string };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Result from fetching HTML with BrowserQL
 */
interface BrowserQLFetchResult {
  html: string | null;
  error: string | null;
  status: number | null;
}

/**
 * Check if BrowserQL is configured (all required env vars must be set)
 */
export function isBrowserlessConfigured(): boolean {
  return !!(
    process.env.BROWSERLESS_ENDPOINT &&
    process.env.BROWSERLESS_TOKEN &&
    process.env.BROWSERLESS_PROXY_STRING &&
    process.env.BROWSERLESS_OPTIONS_STRING
  );
}

/**
 * Build the full BrowserQL URL with token and options
 */
function buildBrowserlessUrl(): string {
  const endpoint = process.env.BROWSERLESS_ENDPOINT!;
  const token = process.env.BROWSERLESS_TOKEN!;
  const proxyString = process.env.BROWSERLESS_PROXY_STRING!;
  const optionsString = process.env.BROWSERLESS_OPTIONS_STRING!;

  return `${endpoint}?token=${token}${proxyString}${optionsString}`;
}

/**
 * Fetch HTML using browserless.io BrowserQL
 * Returns both HTML and any error - timeout errors may still include HTML
 */
async function fetchHtmlWithBrowserQL(
  targetUrl: string
): Promise<BrowserQLFetchResult> {
  if (!isBrowserlessConfigured()) {
    return {
      html: null,
      error: "BrowserQL not configured: missing required env vars",
      status: null,
    };
  }

  const timeout = getTimeout();
  const browserlessUrl = buildBrowserlessUrl();

  console.log(`[BrowserQL] Fetching: ${targetUrl}`);
  debugLog(`Timeout: ${timeout}ms`);
  debugLog(`Endpoint: ${process.env.BROWSERLESS_ENDPOINT}`);

  try {
    const response = await fetch(browserlessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: buildBQLQuery(targetUrl, timeout),
        operationName: "GetPageData",
      }),
      signal: AbortSignal.timeout(timeout + 10000), // Extra buffer for network
    });

    debugLog(`HTTP response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      return {
        html: null,
        error: `BrowserQL HTTP error: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const result: BrowserQLResponse = await response.json();

    // Log full response structure for debugging
    debugLog(`Response has data: ${!!result.data}`);
    debugLog(`Response has errors: ${!!result.errors}`);
    if (result.errors) {
      debugLog(`Errors: ${JSON.stringify(result.errors)}`);
    }
    if (result.data) {
      debugLog(`Viewport: ${JSON.stringify(result.data.viewport)}`);
      debugLog(`Goto status: ${result.data.goto?.status}`);
      debugLog(`HTML length: ${result.data.pageContent?.html?.length ?? 0}`);
    }

    // Extract what we can from the response
    const html = result.data?.pageContent?.html ?? null;
    const status = result.data?.goto?.status ?? null;
    const firstError = result.errors?.[0];
    const errorMessage = firstError?.message ?? null;

    // Log HTML preview if debug enabled
    if (html) {
      if (html.length < 2000) {
        debugLog(`HTML content (full - small response): ${html}`);
      } else {
        debugLog(`HTML preview (first 500 chars): ${html.substring(0, 500)}`);
        debugLog(
          `HTML preview (last 500 chars): ${html.substring(html.length - 500)}`
        );
      }
    }

    return {
      html,
      error: errorMessage,
      status,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    debugLog(`Fetch error: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      debugLog(`Error stack: ${error.stack}`);
    }

    return {
      html: null,
      error: errorMessage,
      status: null,
    };
  }
}

/**
 * Tier 3 extraction: BrowserQL + AI
 *
 * Uses browserless.io's BrowserQL to fetch fully-rendered HTML,
 * then passes it to AI extractor for price/title extraction.
 *
 * Note: Even if BrowserQL reports a timeout error, it may still return
 * valid HTML. We proceed with AI extraction if HTML is present.
 */
export async function browserlessFetch(url: string): Promise<ScraperResult> {
  const fetchResult = await fetchHtmlWithBrowserQL(url);

  // Log what we got
  if (fetchResult.error) {
    console.log(`[BrowserQL] Error reported: ${fetchResult.error}`);
  }
  if (fetchResult.html) {
    console.log(`[BrowserQL] Received ${fetchResult.html.length} chars`);
  }

  // Check for fatal HTTP errors (no HTML at all)
  if (fetchResult.status && fetchResult.status >= 400) {
    console.error(`[BrowserQL] Page returned HTTP ${fetchResult.status}`);
    return {
      success: false,
      error: `BrowserQL failed: Page returned HTTP ${fetchResult.status}`,
      method: "browserless",
    };
  }

  // If we have HTML, proceed with AI extraction even if there was an error
  // (timeout errors still return the HTML that was loaded)
  if (fetchResult.html) {
    if (fetchResult.error) {
      console.log(
        `[BrowserQL] Error occurred but HTML received, proceeding with AI extraction...`
      );
      debugLog(`Proceeding despite error: ${fetchResult.error}`);
    }

    console.log(`[BrowserQL] Passing HTML to AI extractor...`);
    const aiResult = await aiExtract(url, fetchResult.html);

    // Update method to indicate browserless was used
    return {
      ...aiResult,
      method: "browserless",
    };
  }

  // No HTML received - this is a real failure
  const errorMessage = fetchResult.error || "No HTML content received";
  console.error(`[BrowserQL] Failed:`, errorMessage);

  return {
    success: false,
    error: `BrowserQL failed: ${errorMessage}`,
    method: "browserless",
  };
}
