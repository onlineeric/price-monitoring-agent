/**
 * Formatters for MCP tool output.
 *
 * Tool results are consumed by an LLM, not a UI. The model has historically
 * misread bare cents like `58500` as `$58,500` because the field name
 * (`currentPrice`) reads as a price rather than as cents. Every tool that
 * returns a stored price MUST also return a pre-formatted string built with
 * this helper so the model can echo it verbatim and never has to do its own
 * cents-to-dollars arithmetic.
 *
 * Format: `"<CURRENCY> <amount.toFixed(2)>"`, e.g. `"NZD 585.00"`. The bare
 * uppercase currency code (no locale-specific symbols) is intentional — it
 * is unambiguous to the model and round-trips through any locale.
 */

const UNKNOWN_CURRENCY = "UNKNOWN";

export function formatPriceCents(cents: number | null | undefined, currency: string | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  const amount = cents / 100;
  const code = currency && currency.trim().length > 0 ? currency.trim().toUpperCase() : UNKNOWN_CURRENCY;
  return `${code} ${amount.toFixed(2)}`;
}
