import { db, products, priceRecords } from '@price-monitor/db';
import { eq, gte, desc, and } from 'drizzle-orm';
import { subDays } from 'date-fns';

export interface ProductTrendData {
  productId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  currentPrice: number | null;
  currency: string | null;
  lastChecked: Date | null;
  lastFailed: Date | null;
  // Last check comparison
  previousPrice: number | null;
  vsLastCheck: number | null; // Percentage change
  // Average comparisons
  avg7d: number | null;
  vs7dAvg: number | null;
  avg30d: number | null;
  vs30dAvg: number | null;
  avg90d: number | null;
  vs90dAvg: number | null;
  avg180d: number | null;
  vs180dAvg: number | null;
}

/**
 * Calculate average price from array of prices
 */
function calculateAverage(prices: number[]): number | null {
  if (prices.length === 0) return null;
  const sum = prices.reduce((a, b) => a + b, 0);
  return Math.round(sum / prices.length);
}

/**
 * Calculate percentage change between current and previous price
 */
function calculatePercentageChange(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Calculate trends for all active products
 * Returns array of ProductTrendData with price statistics
 */
export async function calculateTrendsForAllProducts(): Promise<ProductTrendData[]> {
  console.log('[Trend Calculator] Calculating trends for all products...');

  // Get all active products
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true));

  console.log(`[Trend Calculator] Found ${allProducts.length} active products`);

  // Calculate trends for each product
  const trendsData = await Promise.all(
    allProducts.map(async (product) => {
      // Get latest price
      const [latestPrice] = await db
        .select()
        .from(priceRecords)
        .where(eq(priceRecords.productId, product.id))
        .orderBy(desc(priceRecords.scrapedAt))
        .limit(1);

      // Get previous price (second most recent)
      const [previousPrice] = await db
        .select()
        .from(priceRecords)
        .where(eq(priceRecords.productId, product.id))
        .orderBy(desc(priceRecords.scrapedAt))
        .limit(1)
        .offset(1);

      // Get price history for different time periods
      const now = new Date();
      const periods = [
        { days: 7, label: '7d' },
        { days: 30, label: '30d' },
        { days: 90, label: '90d' },
        { days: 180, label: '180d' },
      ];

      const averages: Record<string, number | null> = {};
      const vsAverages: Record<string, number | null> = {};

      for (const period of periods) {
        const startDate = subDays(now, period.days);

        const records = await db
          .select()
          .from(priceRecords)
          .where(
            and(
              eq(priceRecords.productId, product.id),
              gte(priceRecords.scrapedAt, startDate)
            )
          );

        const prices = records.map((r) => r.price);
        const avg = calculateAverage(prices);

        averages[`avg${period.label}`] = avg;
        vsAverages[`vs${period.label}Avg`] = calculatePercentageChange(
          latestPrice?.price || null,
          avg
        );
      }

      // Calculate vs last check
      const vsLastCheck = calculatePercentageChange(
        latestPrice?.price || null,
        previousPrice?.price || null
      );

      return {
        productId: product.id,
        name: product.name || 'Unknown Product',
        url: product.url,
        imageUrl: product.imageUrl,
        currentPrice: latestPrice?.price || null,
        currency: latestPrice?.currency || null,
        lastChecked: product.lastSuccessAt,
        lastFailed: product.lastFailedAt,
        previousPrice: previousPrice?.price || null,
        vsLastCheck,
        avg7d: averages.avg7d,
        vs7dAvg: vsAverages.vs7dAvg,
        avg30d: averages.avg30d,
        vs30dAvg: vsAverages.vs30dAvg,
        avg90d: averages.avg90d,
        vs90dAvg: vsAverages.vs90dAvg,
        avg180d: averages.avg180d,
        vs180dAvg: vsAverages.vs180dAvg,
      } as ProductTrendData;
    })
  );

  console.log('[Trend Calculator] Trends calculated for all products');
  return trendsData;
}

/**
 * Calculate trends for a single product by ID
 * Returns ProductTrendData or null if product not found
 */
export async function calculateTrendsForProduct(
  productId: string
): Promise<ProductTrendData | null> {
  console.log(`[Trend Calculator] Calculating trends for product ${productId}...`);

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    console.error(`[Trend Calculator] Product not found: ${productId}`);
    return null;
  }

  // Get latest price
  const [latestPrice] = await db
    .select()
    .from(priceRecords)
    .where(eq(priceRecords.productId, product.id))
    .orderBy(desc(priceRecords.scrapedAt))
    .limit(1);

  // Get previous price (second most recent)
  const [previousPrice] = await db
    .select()
    .from(priceRecords)
    .where(eq(priceRecords.productId, product.id))
    .orderBy(desc(priceRecords.scrapedAt))
    .limit(1)
    .offset(1);

  // Get price history for different time periods
  const now = new Date();
  const periods = [
    { days: 7, label: '7d' },
    { days: 30, label: '30d' },
    { days: 90, label: '90d' },
    { days: 180, label: '180d' },
  ];

  const averages: Record<string, number | null> = {};
  const vsAverages: Record<string, number | null> = {};

  for (const period of periods) {
    const startDate = subDays(now, period.days);

    const records = await db
      .select()
      .from(priceRecords)
      .where(
        and(
          eq(priceRecords.productId, product.id),
          gte(priceRecords.scrapedAt, startDate)
        )
      );

    const prices = records.map((r) => r.price);
    const avg = calculateAverage(prices);

    averages[`avg${period.label}`] = avg;
    vsAverages[`vs${period.label}Avg`] = calculatePercentageChange(
      latestPrice?.price || null,
      avg
    );
  }

  // Calculate vs last check
  const vsLastCheck = calculatePercentageChange(
    latestPrice?.price || null,
    previousPrice?.price || null
  );

  return {
    productId: product.id,
    name: product.name || 'Unknown Product',
    url: product.url,
    imageUrl: product.imageUrl,
    currentPrice: latestPrice?.price || null,
    currency: latestPrice?.currency || null,
    lastChecked: product.lastSuccessAt,
    lastFailed: product.lastFailedAt,
    previousPrice: previousPrice?.price || null,
    vsLastCheck,
    avg7d: averages.avg7d,
    vs7dAvg: vsAverages.vs7dAvg,
    avg30d: averages.avg30d,
    vs30dAvg: vsAverages.vs30dAvg,
    avg90d: averages.avg90d,
    vs90dAvg: vsAverages.vs90dAvg,
    avg180d: averages.avg180d,
    vs180dAvg: vsAverages.vs180dAvg,
  } as ProductTrendData;
}
