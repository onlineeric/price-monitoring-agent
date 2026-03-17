import { subDays } from "date-fns";

import { and, db, desc, eq, gte, priceRecords, products } from "@price-monitor/db";

export interface ReportSnapshotItem {
  productId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  currentPrice: number | null;
  currency: string | null;
  lastChecked: Date | null;
  lastFailed: Date | null;
  vsLastCheck: number | null;
  vs7dAvg: number | null;
  vs30dAvg: number | null;
  vs90dAvg: number | null;
  vs180dAvg: number | null;
}

export interface ActiveProductReportSnapshot {
  generatedAt: Date;
  productCount: number;
  items: ReportSnapshotItem[];
}

function calculateAverage(prices: number[]): number | null {
  if (prices.length === 0) {
    return null;
  }

  const total = prices.reduce((sum, price) => sum + price, 0);
  return Math.round(total / prices.length);
}

function calculatePercentageChange(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return ((current - baseline) / baseline) * 100;
}

function averageForWindow(
  records: Array<{ price: number; scrapedAt: Date | null }>,
  now: Date,
  windowInDays: number,
) {
  const cutoff = subDays(now, windowInDays);
  const prices = records
    .filter((record) => record.scrapedAt !== null && record.scrapedAt >= cutoff)
    .map((record) => record.price);
  return calculateAverage(prices);
}

export function buildSnapshotItemFromRecords(
  product: Pick<
    typeof products.$inferSelect,
    "id" | "name" | "url" | "imageUrl" | "lastSuccessAt" | "lastFailedAt"
  >,
  records: Array<{ price: number; currency: string | null; scrapedAt: Date | null }>,
  now: Date,
): ReportSnapshotItem {
  const latestRecord = records[0] ?? null;
  const previousRecord = records[1] ?? null;

  const avg7d = averageForWindow(records, now, 7);
  const avg30d = averageForWindow(records, now, 30);
  const avg90d = averageForWindow(records, now, 90);
  const avg180d = averageForWindow(records, now, 180);

  const currentPrice = latestRecord?.price ?? null;

  return {
    productId: product.id,
    name: product.name ?? "Unnamed Product",
    url: product.url,
    imageUrl: product.imageUrl ?? null,
    currentPrice,
    currency: latestRecord?.currency ?? null,
    lastChecked: product.lastSuccessAt ?? null,
    lastFailed: product.lastFailedAt ?? null,
    vsLastCheck: calculatePercentageChange(currentPrice, previousRecord?.price ?? null),
    vs7dAvg: calculatePercentageChange(currentPrice, avg7d),
    vs30dAvg: calculatePercentageChange(currentPrice, avg30d),
    vs90dAvg: calculatePercentageChange(currentPrice, avg90d),
    vs180dAvg: calculatePercentageChange(currentPrice, avg180d),
  };
}

async function loadRecordsForProduct(productId: string, now: Date) {
  return db
    .select({
      price: priceRecords.price,
      currency: priceRecords.currency,
      scrapedAt: priceRecords.scrapedAt,
    })
    .from(priceRecords)
    .where(and(eq(priceRecords.productId, productId), gte(priceRecords.scrapedAt, subDays(now, 180))))
    .orderBy(desc(priceRecords.scrapedAt));
}

export async function buildActiveProductReportSnapshot(now = new Date()): Promise<ActiveProductReportSnapshot> {
  const activeProducts = await db.select().from(products).where(eq(products.active, true));

  const items = await Promise.all(
    activeProducts.map(async (product) => {
      const records = await loadRecordsForProduct(product.id, now);
      return buildSnapshotItemFromRecords(product, records, now);
    }),
  );

  return {
    generatedAt: now,
    productCount: items.length,
    items,
  };
}
