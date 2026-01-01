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
const MAX_HTML_LENGTH = 15000;

/**
 * Extract main content area from HTML using semantic tags
 */
function extractMainContent($: cheerio.CheerioAPI): string {
  // Try semantic content areas in order of specificity
  const mainContent = $("main").html();
  if (mainContent) return mainContent;

  const articleContent = $("article").html();
  if (articleContent) return articleContent;

  const bodyContent = $("body").html();
  if (bodyContent) return bodyContent;

  return $.html();
}

/**
 * Remove noise from HTML (scripts, styles, comments)
 */
function cleanHtml($: cheerio.CheerioAPI): void {
  $("script").remove();
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
  const $ = cheerio.load(html);

  cleanHtml($);

  const mainContent = extractMainContent($);
  const normalized = normalizeWhitespace(mainContent);
  const truncated = truncateText(normalized, MAX_HTML_LENGTH);

  return truncated;
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
      prompt: `Extract product information from this HTML. Find the product title, current price (as a number without currency symbol), and currency code.

If there are multiple prices, extract the main/current selling price (not the original or crossed-out price).

HTML content:
${preparedHtml}`,
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
        imageUrl: null, // AI extraction doesn't get images for now
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
