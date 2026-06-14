import type { ProductWithStats } from "./products-view";

/**
 * Percentage change across the available price history (oldest → newest), or
 * null when there are fewer than two points or the oldest price is 0 (which
 * would otherwise divide-by-zero into Infinity/NaN).
 *
 * Shared by the product card view and the product detail dialog so both compute
 * the trend the same way.
 */
export function calculatePriceChange(history: ProductWithStats["priceHistory"]): number | null {
  if (history.length < 2) return null;
  const oldest = history[0].price;
  const newest = history[history.length - 1].price;
  if (oldest === 0) return null;
  return ((newest - oldest) / oldest) * 100;
}
