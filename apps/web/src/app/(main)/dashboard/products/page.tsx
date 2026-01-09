import { db, products, priceRecords } from '@price-monitor/db';
import { eq, desc, gte } from 'drizzle-orm';
import { subDays } from 'date-fns';

import { ProductsView } from './_components/products-view';
import { AddProductButton } from './_components/add-product-button';

async function getProductsWithStats() {
  // Get all products
  const allProducts = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt));

  // For each product, get current price and price history (last 30 days)
  const productsWithStats = await Promise.all(
    allProducts.map(async (product) => {
      // Get latest price
      const [latestPrice] = await db
        .select()
        .from(priceRecords)
        .where(eq(priceRecords.productId, product.id))
        .orderBy(desc(priceRecords.scrapedAt))
        .limit(1);

      // Get price history for last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30);
      const priceHistory = await db
        .select()
        .from(priceRecords)
        .where(eq(priceRecords.productId, product.id))
        .where(gte(priceRecords.scrapedAt, thirtyDaysAgo))
        .orderBy(priceRecords.scrapedAt);

      return {
        ...product,
        currentPrice: latestPrice?.price || null,
        currency: latestPrice?.currency || 'USD',
        lastChecked: latestPrice?.scrapedAt || null,
        priceHistory: priceHistory.map((record) => ({
          date: record.scrapedAt,
          price: record.price,
        })),
      };
    })
  );

  return productsWithStats;
}

export default async function ProductsPage() {
  const products = await getProductsWithStats();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            Manage your {products.length} monitored product{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <AddProductButton />
      </div>

      {/* Products View (handles both card and table views) */}
      <ProductsView products={products} />
    </div>
  );
}
