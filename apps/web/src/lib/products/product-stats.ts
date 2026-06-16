import { db, type ProductAttribute, priceRecords, products } from "@price-monitor/db";
import { subDays } from "date-fns";
import { and, desc, eq, gte } from "drizzle-orm";

/**
 * Canonical "product enriched with price stats" shape consumed by the products
 * page views AND the product detail dialog (reused from the chat page in
 * feature 009). This is the single source of truth for the type — the products
 * views re-export it for backwards-compatible import paths.
 *
 * Prices are integer cents (never divided here). Date fields are real `Date`
 * objects; callers that hydrate this shape from a JSON API response (e.g. the
 * chat detail-dialog hook) must revive the date strings first.
 */
export type ProductWithStats = {
  id: string;
  url: string;
  name: string;
  imageUrl: string | null;
  active: boolean;
  lastSuccessAt: Date | null;
  lastFailedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  currentPrice: number | null;
  currency: string;
  lastChecked: Date | null;
  priceHistory: Array<{
    date: Date;
    price: number;
  }>;
  // Rich metadata (feature 007).
  description: string | null;
  category: string | null;
  brand: string | null;
  countryOfOrigin: string | null;
  attributes: ProductAttribute[] | null;
  infoUpdatedAt: Date | null;
};

/** Window (days) of price history surfaced in the mini chart / detail dialog. */
const PRICE_HISTORY_DAYS = 30;

type ProductRow = typeof products.$inferSelect;

/**
 * Enrich one raw product row with its latest price and recent price history.
 * Two small indexed queries (latest price + last 30 days) — cheap for a single
 * product, and the same mapper the list path applies per product.
 */
async function toProductWithStats(product: ProductRow): Promise<ProductWithStats> {
  const [latestPrice] = await db
    .select()
    .from(priceRecords)
    .where(eq(priceRecords.productId, product.id))
    .orderBy(desc(priceRecords.scrapedAt))
    .limit(1);

  const cutoff = subDays(new Date(), PRICE_HISTORY_DAYS);
  const priceHistory = await db
    .select()
    .from(priceRecords)
    .where(and(eq(priceRecords.productId, product.id), gte(priceRecords.scrapedAt, cutoff)))
    .orderBy(priceRecords.scrapedAt);

  return {
    ...product,
    name: product.name || "Unnamed Product",
    imageUrl: product.imageUrl || null,
    active: product.active ?? true,
    currentPrice: latestPrice?.price ?? null,
    currency: latestPrice?.currency || "USD",
    lastChecked: latestPrice?.scrapedAt ?? null,
    priceHistory: priceHistory
      .filter((record): record is typeof record & { scrapedAt: Date } => record.scrapedAt !== null)
      .map((record) => ({
        date: record.scrapedAt,
        price: record.price,
      })),
  };
}

/** All products (newest first) enriched with price stats — products page list. */
export async function getAllProductsWithStats(): Promise<ProductWithStats[]> {
  const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));
  return Promise.all(allProducts.map(toProductWithStats));
}

/** One product by id enriched with price stats, or `null` if it does not exist. */
export async function getProductWithStats(id: string): Promise<ProductWithStats | null> {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  return toProductWithStats(product);
}
