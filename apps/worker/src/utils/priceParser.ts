/**
 * Shared utility for parsing price strings into cents and currency.
 * Used by both HTML fetcher and Playwright fetcher.
 */

// Currency symbols to ISO codes mapping
export const CURRENCY_MAP: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₽": "RUB",
  "₩": "KRW",
  "฿": "THB",
  A$: "AUD",
  C$: "CAD",
};

/**
 * Parse price text into cents and currency
 * @param priceText - Raw price text (e.g., "$19.99", "€1.234,56", "£19.99")
 * @returns Object with price in cents and currency code, or null if parsing fails
 */
export function parsePrice(
  priceText: string
): { price: number; currency: string } | null {
  if (!priceText) return null;

  // Clean the text
  const cleaned = priceText.trim();

  // Detect currency from symbol
  let currency = "USD"; // default
  for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
    if (cleaned.includes(symbol)) {
      currency = code;
      break;
    }
  }

  // Also check for currency codes like "USD", "EUR" etc.
  const codeMatch = cleaned.match(/\b(USD|EUR|GBP|JPY|INR|AUD|CAD)\b/i);
  if (codeMatch) {
    currency = codeMatch[1].toUpperCase();
  }

  // Extract numeric value
  // Handle formats: $19.99, 19,99 €, £1,234.56, $1.234,56 (European)
  const numericMatch = cleaned.match(/[\d.,]+/);
  if (!numericMatch) return null;

  let numStr = numericMatch[0];

  // Determine decimal separator
  // If there's both comma and period, the last one is decimal separator
  const lastComma = numStr.lastIndexOf(",");
  const lastPeriod = numStr.lastIndexOf(".");

  if (lastComma > lastPeriod) {
    // European format: 1.234,56 -> 1234.56
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else {
    // US format: 1,234.56 -> 1234.56
    numStr = numStr.replace(/,/g, "");
  }

  const value = parseFloat(numStr);
  if (isNaN(value)) return null;

  // Convert to cents
  const priceInCents = Math.round(value * 100);

  return { price: priceInCents, currency };
}

/**
 * Resolve a potentially relative URL to absolute
 * @param imageUrl - The image URL (may be relative)
 * @param baseUrl - The base URL of the page
 * @returns Absolute URL
 */
export function resolveImageUrl(
  imageUrl: string | null,
  baseUrl: string
): string | null {
  if (!imageUrl) return null;

  // Already absolute
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // Protocol-relative URL
  if (imageUrl.startsWith("//")) {
    return "https:" + imageUrl;
  }

  // Absolute path
  if (imageUrl.startsWith("/")) {
    const url = new URL(baseUrl);
    return url.origin + imageUrl;
  }

  // Relative path (e.g., "../images/pic.jpg")
  const url = new URL(baseUrl);
  return new URL(imageUrl, url.href).href;
}
