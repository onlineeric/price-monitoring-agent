import type { ProductAttribute } from "@price-monitor/db";

/**
 * Result returned by any scraper implementation
 */
export interface ScraperResult {
  success: boolean;
  data?: {
    title: string | null;
    price: number | null; // Price in cents (e.g., 1999 = $19.99)
    currency: string | null; // ISO 4217 code (e.g., 'USD', 'EUR')
    imageUrl: string | null;
  };
  error?: string;
  method: "html" | "playwright" | "ai"; // Which tier was used
}

/**
 * Rich product metadata + price produced by the AI-tier "product info" path
 * (`aiExtractProductInfo` / `scrapeProductInfo`). It is a superset of the
 * price-only `ScraperResult.data`: the existing price fields are unchanged
 * (FR-004) and the new metadata fields are all nullable — the extractor returns
 * only what it finds.
 */
export interface ProductInfoData {
  title: string | null;
  price: number | null; // Price in cents
  currency: string | null; // ISO 4217 code
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  countryOfOrigin: string | null;
  attributes: ProductAttribute[] | null; // validated + capped at 100
}

/**
 * Result of a product-info extraction. Always AI-tier (`method: "ai"`).
 */
export interface ProductInfoResult {
  success: boolean;
  data?: ProductInfoData;
  error?: string;
  method: "ai";
}

/**
 * Configuration for scraper behavior
 */
export interface ScraperConfig {
  timeout?: number; // Request timeout in ms (default: 10000)
  userAgent?: string; // Custom User-Agent header
}
