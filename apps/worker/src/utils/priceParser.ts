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
  const currencyCode = codeMatch?.[1];
  if (currencyCode) {
    currency = currencyCode.toUpperCase();
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
 * Resolve a potentially relative URL to absolute and validate it's safe
 * @param imageUrl - The image URL (may be relative)
 * @param baseUrl - The base URL of the page
 * @returns Absolute URL if valid and safe, null otherwise
 */
export function resolveImageUrl(
  imageUrl: string | null,
  baseUrl: string
): string | null {
  if (!imageUrl) return null;

  // Sanitize: trim whitespace and reject dangerous protocols
  const trimmed = imageUrl.trim();
  const lowerUrl = trimmed.toLowerCase();

  // Block dangerous protocols (XSS vectors)
  const dangerousProtocols = [
    "javascript:",
    "data:",
    "file:",
    "vbscript:",
    "about:",
  ];
  if (dangerousProtocols.some((proto) => lowerUrl.startsWith(proto))) {
    console.warn(`[Security] Blocked dangerous image URL: ${trimmed}`);
    return null;
  }

  let resolvedUrl: string;

  // Already absolute
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    resolvedUrl = trimmed;
  }
  // Protocol-relative URL
  else if (trimmed.startsWith("//")) {
    resolvedUrl = "https:" + trimmed;
  }
  // Absolute path
  else if (trimmed.startsWith("/")) {
    try {
      const url = new URL(baseUrl);
      resolvedUrl = url.origin + trimmed;
    } catch (e) {
      console.warn(`[Security] Invalid base URL for image: ${baseUrl}`);
      return null;
    }
  }
  // Relative path (e.g., "../images/pic.jpg")
  else {
    try {
      const url = new URL(baseUrl);
      resolvedUrl = new URL(trimmed, url.href).href;
    } catch (e) {
      console.warn(`[Security] Failed to resolve relative image URL: ${trimmed}`);
      return null;
    }
  }

  // Final validation: ensure result is http or https
  if (!resolvedUrl.startsWith("http://") && !resolvedUrl.startsWith("https://")) {
    console.warn(`[Security] Resolved URL has invalid protocol: ${resolvedUrl}`);
    return null;
  }

  return resolvedUrl;
}
