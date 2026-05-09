export function formatPrice(cents: number, currency: string | null | undefined = "AUD") {
  const amount = cents / 100;
  const code = currency ?? "AUD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    // Intl.NumberFormat throws RangeError for non-ISO 4217 codes (e.g. "$"
    // accidentally stored by the scraper). Degrade to a plain string instead
    // of crashing the page.
    return `${code} ${amount.toFixed(2)}`;
  }
}
