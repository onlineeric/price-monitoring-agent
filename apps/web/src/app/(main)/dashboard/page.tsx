import { db, eq, gte, priceRecords, products, sql } from "@price-monitor/db";
import { subDays } from "date-fns";
import { Activity, Clock, DollarSign, Package, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { ManualTriggerButton } from "./_components/manual-trigger-button";

async function getDashboardStats() {
  // Get total active products count
  const [productCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.active, true));

  const totalProducts = Number(productCount?.count || 0);

  // Get total price checks
  const [priceCheckCount] = await db.select({ count: sql<number>`count(*)` }).from(priceRecords);

  const totalPriceChecks = Number(priceCheckCount?.count || 0);

  // Get latest prices for active products using DISTINCT ON (optimized, single query)
  // This gets the most recent price record for each product in one query
  const latestPricesResult = await db.execute<{ price: number }>(sql`
    SELECT DISTINCT ON (pr.product_id) pr.price
    FROM ${priceRecords} pr
    INNER JOIN ${products} p ON pr.product_id = p.id
    WHERE p.active = true
    ORDER BY pr.product_id, pr.scraped_at DESC
  `);

  const latestPrices = Array.from(latestPricesResult).map((row) => row.price);

  const avgPrice =
    latestPrices.length > 0 ? Math.round(latestPrices.reduce((sum, price) => sum + price, 0) / latestPrices.length) : 0;

  // Get count of products with price changes in last 24 hours (database aggregation)
  const oneDayAgo = subDays(new Date(), 1);
  const productsWithChanges = await db
    .select({
      productId: priceRecords.productId,
      distinctPrices: sql<number>`COUNT(DISTINCT ${priceRecords.price})`,
    })
    .from(priceRecords)
    .innerJoin(products, eq(priceRecords.productId, products.id))
    .where(gte(priceRecords.scrapedAt, oneDayAgo))
    .groupBy(priceRecords.productId)
    .having(sql`COUNT(DISTINCT ${priceRecords.price}) > 1`);

  return {
    totalProducts,
    totalPriceChecks,
    avgPrice,
    recentChanges: productsWithChanges.length,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  // Format average price (assuming USD for display, adjust as needed)
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your price monitoring system</p>
        </div>
        <ManualTriggerButton />
      </div>

      {/* Stats Cards */}
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4">
        {/* Total Products Card */}
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Package className="size-4" />
              Total Products
            </CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">{stats.totalProducts}</CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Active products being monitored</div>
          </CardFooter>
        </Card>

        {/* Total Price Checks Card */}
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Activity className="size-4" />
              Total Price Checks
            </CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">
              {stats.totalPriceChecks.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Price records in database</div>
          </CardFooter>
        </Card>

        {/* Average Price Card */}
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="size-4" />
              Average Price
            </CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">
              {stats.totalProducts > 0 ? formatPrice(stats.avgPrice) : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Across all monitored products</div>
          </CardFooter>
        </Card>

        {/* Recent Changes Card */}
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Clock className="size-4" />
              Recent Changes
            </CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">{stats.recentChanges}</CardTitle>
            <CardAction>
              {stats.recentChanges > 0 ? (
                <Badge variant="outline" className="gap-1">
                  <TrendingUp className="size-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  Stable
                </Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Price changes in last 24 hours</div>
          </CardFooter>
        </Card>
      </div>

      {/* Info Section */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-2 font-semibold text-xl">About Price Monitor</h2>
        <p className="mb-4 text-muted-foreground">
          This dashboard tracks product prices from any URL using a 2-tier extraction pipeline (HTML + Playwright with
          AI fallback). Prices are stored in PostgreSQL, and email digests are sent via Resend on a configurable
          schedule.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Next.js 16</Badge>
          <Badge variant="secondary">Playwright</Badge>
          <Badge variant="secondary">AI Extraction</Badge>
          <Badge variant="secondary">BullMQ</Badge>
          <Badge variant="secondary">PostgreSQL</Badge>
          <Badge variant="secondary">Resend</Badge>
        </div>
      </div>
    </div>
  );
}
