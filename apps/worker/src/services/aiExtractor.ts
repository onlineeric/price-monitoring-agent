import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import * as cheerio from "cheerio";
import type { ScraperResult } from "../types/scraper.js";

/**
 * Zod schema for structured product data extraction
 */
const ProductDataSchema = z.object({
  title: z.string().nullable().describe("The product name/title"),
  price: z
    .number()
    .nullable()
    .describe("The current price as a decimal number (e.g., 19.99)"),
  currency: z
    .string()
    .nullable()
    .describe("The currency code (USD, EUR, GBP, NZD, AUD, etc.)"),
  imageUrl: z
    .string()
    .nullable()
    .describe("The main product image URL (full URL with https://, not relative path)"),
});

/**
 * Supported AI providers
 */
type AIProvider = "openai" | "google" | "anthropic";

/**
 * Get model name from environment variable
 * Throws error if not configured
 */
function getModelName(provider: AIProvider): string {
  let modelName: string | undefined;
  let envVarName: string;

  switch (provider) {
    case "google":
      modelName = process.env.GOOGLE_MODEL;
      envVarName = "GOOGLE_MODEL";
      break;
    case "anthropic":
      modelName = process.env.ANTHROPIC_MODEL;
      envVarName = "ANTHROPIC_MODEL";
      break;
    case "openai":
    default:
      modelName = process.env.OPENAI_MODEL;
      envVarName = "OPENAI_MODEL";
      break;
  }

  if (!modelName) {
    throw new Error(
      `${envVarName} environment variable is required for AI extraction`
    );
  }

  return modelName;
}

/**
 * Get the AI model instance for the selected provider
 * Passes the model name directly to the provider SDK
 */
function getModel(provider: AIProvider) {
  const modelName = getModelName(provider);

  switch (provider) {
    case "google":
      return google(modelName);
    case "anthropic":
      return anthropic(modelName);
    case "openai":
    default:
      return openai(modelName);
  }
}

/**
 * Get the configured AI provider from environment
 */
function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "google" || provider === "anthropic") {
    return provider;
  }
  return "openai"; // default
}

/**
 * Maximum characters to send to AI model (to stay within token limits)
 */
const MAX_HTML_LENGTH = 150000;

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
    console.log(`[debug] [AI Extractor] ${message}`);
  }
}

/**
 * Minimum content length threshold - if extracted content is below this,
 * try a broader selector
 */
const MIN_CONTENT_LENGTH = 3000;

/**
 * Extract main content area from HTML using semantic tags
 * Falls back to broader selectors if content is too small
 */
function extractMainContent($: cheerio.CheerioAPI): string {
  // Try semantic content areas in order of specificity
  const mainContent = $("main").html();
  if (mainContent) {
    debugLog(`Found <main> tag with ${mainContent.length} chars`);
    // If main content is substantial, use it
    if (mainContent.length >= MIN_CONTENT_LENGTH) {
      return mainContent;
    }
    debugLog(`<main> content too small (${mainContent.length} < ${MIN_CONTENT_LENGTH}), trying broader selectors`);
  }

  const articleContent = $("article").html();
  if (articleContent) {
    debugLog(`Found <article> tag with ${articleContent.length} chars`);
    if (articleContent.length >= MIN_CONTENT_LENGTH) {
      return articleContent;
    }
    debugLog(`<article> content too small, trying broader selectors`);
  }

  const bodyContent = $("body").html();
  if (bodyContent) {
    debugLog(`Using <body> tag with ${bodyContent.length} chars`);
    return bodyContent;
  }

  debugLog(`No body found, using full HTML`);
  return $.html();
}

/**
 * Remove noise from HTML (scripts, styles, comments)
 * Preserves JSON-LD structured data which contains useful product info
 */
function cleanHtml($: cheerio.CheerioAPI): void {
  // Remove executable JavaScript but keep JSON-LD structured data
  $("script:not([type='application/ld+json'])").remove();
  $("style").remove();
  $("noscript").remove();
  $("iframe").remove();
}

/**
 * Normalize whitespace in text content
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Truncate text to maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "... [truncated]";
}

/**
 * Prepare HTML for AI extraction by cleaning and truncating
 */
function prepareHtmlForAI(html: string): string {
  debugLog(`Input HTML length: ${html.length} chars`);

  const $ = cheerio.load(html);

  cleanHtml($);
  const afterCleanLength = $.html().length;
  debugLog(`After cleanHtml (removed scripts/styles): ${afterCleanLength} chars`);

  const mainContent = extractMainContent($);
  debugLog(`After extractMainContent: ${mainContent.length} chars`);

  const normalized = normalizeWhitespace(mainContent);
  debugLog(`After normalizeWhitespace: ${normalized.length} chars`);

  const truncated = truncateText(normalized, MAX_HTML_LENGTH);
  debugLog(`After truncateText (max ${MAX_HTML_LENGTH}): ${truncated.length} chars`);

  return truncated;
}

/**
 * AI extraction prompt - extracts title, price, currency, and main image URL from HTML
 */
function getExtractionPrompt(html: string): string {
  return `Extract product information from this HTML. 
Find the product title, current price (as a number without currency symbol), currency code, and main product image URL.

Instructions:
- If there are multiple prices, extract the main/current/discounted selling price, it is not the original price, not unit price nor crossed-out price.
- For imageUrl, extract the main product image URL (look for <img> tags with src or data-src attributes)
- The imageUrl should be a complete URL starting with https:// (not a relative path like /images/product.jpg)
- If you find a relative image path, you'll need to construct the full URL

HTML content:
${html}`;
}


/**
 * AI-powered product data extraction using Vercel AI SDK
 *
 * Accepts fully-rendered HTML (typically from Playwright) and uses AI to extract
 * product data when traditional selector-based extraction fails.
 *
 * @param url - Product URL (for logging/context)
 * @param html - Fully-rendered HTML content (with JavaScript executed)
 */
export async function aiExtract(url: string, html: string): Promise<ScraperResult> {
  const provider = getProvider();
  const modelName = getModelName(provider);
  console.log(`[AI Extractor] Using provider: ${provider}, model: ${modelName}`);

  try {
    const preparedHtml = prepareHtmlForAI(html);

    console.log(
      `[AI Extractor] Sending ${preparedHtml.length} chars to ${provider}...`
    );

    // Call AI with structured output
    const { object } = await generateObject({
      model: getModel(provider),
      schema: ProductDataSchema,
      prompt: getExtractionPrompt(preparedHtml),
    });

    console.log(`[AI Extractor] Response:`, object);

    // Validate we got at least title or price
    const hasTitle = object.title !== null && object.title.length > 0;
    const hasPrice = object.price !== null;

    if (!hasTitle && !hasPrice) {
      return {
        success: false,
        error: "AI extraction failed: no title or price found in HTML",
        method: "ai",
      };
    }

    // Convert price from decimal to cents (e.g., 19.99 -> 1999)
    const priceInCents = hasPrice ? Math.round(object.price! * 100) : null;

    return {
      success: true,
      data: {
        title: object.title,
        price: priceInCents,
        currency: object.currency,
        imageUrl: object.imageUrl,
      },
      method: "ai",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AI Extractor] Unexpected error:`, error);

    return {
      success: false,
      error: `AI extraction error: ${errorMessage}`,
      method: "ai",
    };
  }
}
