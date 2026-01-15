import { db, priceRecords, products } from "@price-monitor/db";
import { subDays } from "date-fns";
import { and, desc, eq, gte } from "drizzle-orm";

import { AddProductButton } from "./_components/add-product-button";
import { ProductsView } from "./_components/products-view";

async function getProductsWithStats() {
  // Get all products
  const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));

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
        .where(and(eq(priceRecords.productId, product.id), gte(priceRecords.scrapedAt, thirtyDaysAgo)))
        .orderBy(priceRecords.scrapedAt);

      return {
        ...product,
        name: product.name || "Unnamed Product",
        imageUrl: product.imageUrl || null,
        active: product.active ?? true,
        currentPrice: latestPrice?.price || null,
        currency: latestPrice?.currency || "USD",
        lastChecked: latestPrice?.scrapedAt || null,
        priceHistory: priceHistory
          .filter((record): record is typeof record & { scrapedAt: Date } => record.scrapedAt !== null)
          .map((record) => ({
            date: record.scrapedAt,
            price: record.price,
          })),
      };
    }),
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
          <h1 className="font-bold text-3xl">Products</h1>
          <p className="text-muted-foreground">
            Manage your {products.length} monitored product{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <AddProductButton />
      </div>

      {/* Products View (handles both card and table views) */}
      <ProductsView products={products} />
    </div>
  );
}
