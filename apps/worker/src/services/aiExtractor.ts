import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { MAX_PRODUCT_ATTRIBUTES, sanitizeProductAttributes } from "@price-monitor/db";
import { generateObject } from "ai";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { ProductInfoResult, ScraperResult } from "../types/scraper.js";
import { normalizeCurrency } from "../utils/priceParser.js";

/**
 * Zod schema for structured product data extraction
 */
const ProductDataSchema = z.object({
  title: z.string().nullable().describe("The product name/title"),
  price: z.number().nullable().describe("The current price as a decimal number (e.g., 19.99)"),
  currency: z.string().nullable().describe("The currency code (USD, EUR, GBP, NZD, AUD, etc.)"),
  imageUrl: z.string().nullable().describe("The main product image URL (full URL with https://, not relative path)"),
});

/**
 * Extended schema for the rich "product info" path. Superset of
 * ProductDataSchema (price fields unchanged) plus optional metadata. The model
 * returns only what it finds — every new field is nullable.
 */
const ProductInfoSchema = ProductDataSchema.extend({
  description: z.string().nullable().describe("A concise product description (plain text, no HTML)"),
  category: z.string().nullable().describe("The product category, e.g. 'Kitchen appliances'"),
  brand: z.string().nullable().describe("The brand or manufacturer name"),
  countryOfOrigin: z.string().nullable().describe("The country of origin / where it is made"),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable()
    .describe(
      `Key/value product specifications (e.g. {key:"Material", value:"Steel"}). Return at most the ${MAX_PRODUCT_ATTRIBUTES} most relevant, most important first. Omit anything not present — never invent values.`,
    ),
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
    default:
      modelName = process.env.OPENAI_MODEL;
      envVarName = "OPENAI_MODEL";
      break;
  }

  if (!modelName) {
    throw new Error(`${envVarName} environment variable is required for AI extraction`);
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
  return `${text.substring(0, maxLength)}... [truncated]`;
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
 * Extraction prompt for the rich "product info" path. Extends the price-only
 * instructions with the new metadata fields and the 100-attribute cap.
 */
function getProductInfoPrompt(html: string): string {
  return `Extract detailed product information from this HTML.
Find the product title, current price (number, no currency symbol), currency code, main image URL,
and the following metadata when available: a concise plain-text description, the category, the
brand/manufacturer, the country of origin, and key/value specification attributes.

Instructions:
- If there are multiple prices, extract the main/current/discounted selling price — not the original,
  not the unit price, not a crossed-out price.
- For imageUrl, extract the main product image as a complete https:// URL (construct it from a relative path if needed).
- For attributes, return at most the ${MAX_PRODUCT_ATTRIBUTES} most relevant specifications as {key, value} pairs,
  most important first (e.g. {"key":"Material","value":"Stainless steel"}).
- Omit any field you cannot find rather than inventing a value; use null for missing scalar fields.

HTML content:
${html}`;
}

/**
 * AI-powered rich product-info extraction (price + metadata) using Vercel AI SDK.
 *
 * Used only by the `update-product-info` operation — the cheap price path
 * (`aiExtract`) is unchanged. Accepts fully-rendered HTML (from Playwright) and
 * returns the price fields plus description/category/brand/country/attributes.
 * Attributes are defensively sanitized + capped at 100 before being returned.
 *
 * @param url - Product URL (for logging/context)
 * @param html - Fully-rendered HTML content (with JavaScript executed)
 */
export async function aiExtractProductInfo(_url: string, html: string): Promise<ProductInfoResult> {
  const provider = getProvider();
  const modelName = getModelName(provider);
  console.log(`[AI Extractor] (info) Using provider: ${provider}, model: ${modelName}`);

  try {
    const preparedHtml = prepareHtmlForAI(html);
    console.log(`[AI Extractor] (info) Sending ${preparedHtml.length} chars to ${provider}...`);

    const { object } = await generateObject({
      model: getModel(provider),
      schema: ProductInfoSchema,
      prompt: getProductInfoPrompt(preparedHtml),
    });

    console.log(`[AI Extractor] (info) Response:`, object);

    // Same usefulness guard as aiExtract: need at least a title or a price.
    // The job enforces the stricter "must have a price" rule (a no-price run is
    // a total failure that leaves metadata untouched).
    const hasTitle = object.title !== null && object.title.length > 0;
    const hasPrice = object.price !== null;
    if (!hasTitle && !hasPrice) {
      return {
        success: false,
        error: "AI extraction failed: no title or price found in HTML",
        method: "ai",
      };
    }

    const priceInCents = hasPrice && object.price != null ? Math.round(object.price * 100) : null;

    return {
      success: true,
      data: {
        title: object.title,
        price: priceInCents,
        currency: normalizeCurrency(object.currency),
        imageUrl: object.imageUrl,
        description: object.description,
        category: object.category,
        brand: object.brand,
        countryOfOrigin: object.countryOfOrigin,
        // Defensive: drop empty pairs + truncate to 100 regardless of model output.
        attributes: sanitizeProductAttributes(object.attributes),
      },
      method: "ai",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AI Extractor] (info) Unexpected error:`, error);
    return {
      success: false,
      error: `AI extraction error: ${errorMessage}`,
      method: "ai",
    };
  }
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
export async function aiExtract(_url: string, html: string): Promise<ScraperResult> {
  const provider = getProvider();
  const modelName = getModelName(provider);
  console.log(`[AI Extractor] Using provider: ${provider}, model: ${modelName}`);

  try {
    const preparedHtml = prepareHtmlForAI(html);

    console.log(`[AI Extractor] Sending ${preparedHtml.length} chars to ${provider}...`);

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
    const priceInCents = hasPrice && object.price != null ? Math.round(object.price * 100) : null;

    return {
      success: true,
      data: {
        title: object.title,
        price: priceInCents,
        currency: normalizeCurrency(object.currency),
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
