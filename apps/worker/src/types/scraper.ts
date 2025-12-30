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
 * Configuration for scraper behavior
 */
export interface ScraperConfig {
  timeout?: number; // Request timeout in ms (default: 10000)
  userAgent?: string; // Custom User-Agent header
}
