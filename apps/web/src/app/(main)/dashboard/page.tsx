import { db, products, priceRecords, eq, desc, gte, sql } from '@price-monitor/db';
import { TrendingDown, TrendingUp, Package, DollarSign, Activity, Clock } from 'lucide-react';
import { subDays } from 'date-fns';

import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ManualTriggerButton } from './_components/manual-trigger-button';

async function getDashboardStats() {
  // Get all active products
  const activeProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true));

  const totalProducts = activeProducts.length;

  // Get total price checks
  const [priceCheckCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(priceRecords);

  const totalPriceChecks = Number(priceCheckCount?.count || 0);

  // Get current prices for average calculation
  const currentPrices = await Promise.all(
    activeProducts.map(async (product) => {
      const [latest] = await db
        .select()
        .from(priceRecords)
        .where(eq(priceRecords.productId, product.id))
        .orderBy(desc(priceRecords.scrapedAt))
        .limit(1);
      return latest;
    })
  );

  const validPrices = currentPrices.filter(Boolean);
  const avgPrice = validPrices.length > 0
    ? Math.round(
        validPrices.reduce((sum, record) => sum + record.price, 0) / validPrices.length
      )
    : 0;

  // Get recent changes (last 24 hours)
  const oneDayAgo = subDays(new Date(), 1);
  const recentChecks = await db
    .select()
    .from(priceRecords)
    .where(gte(priceRecords.scrapedAt, oneDayAgo));

  // Count unique products with price changes in last 24h
  const productsWithChanges = new Set<string>();
  for (const product of activeProducts) {
    const productChecks = recentChecks.filter(r => r.productId === product.id);
    if (productChecks.length > 1) {
      // Check if price actually changed
      const prices = productChecks.map(c => c.price);
      if (new Set(prices).size > 1) {
        productsWithChanges.add(product.id);
      }
    }
  }

  return {
    totalProducts,
    totalPriceChecks,
    avgPrice,
    recentChanges: productsWithChanges.size,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  // Format average price (assuming USD for display, adjust as needed)
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your price monitoring system
          </p>
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
            <CardTitle className="font-semibold text-3xl tabular-nums">
              {stats.totalProducts}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">
              Active products being monitored
            </div>
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
            <div className="text-muted-foreground">
              Price records in database
            </div>
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
              {stats.totalProducts > 0 ? formatPrice(stats.avgPrice) : 'N/A'}
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">
              Across all monitored products
            </div>
          </CardFooter>
        </Card>

        {/* Recent Changes Card */}
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Clock className="size-4" />
              Recent Changes
            </CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">
              {stats.recentChanges}
            </CardTitle>
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
            <div className="text-muted-foreground">
              Price changes in last 24 hours
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Info Section */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-2">About Price Monitor</h2>
        <p className="text-muted-foreground mb-4">
          This dashboard tracks product prices from any URL using a 2-tier extraction pipeline
          (HTML + Playwright with AI fallback). Prices are stored in PostgreSQL, and email digests
          are sent via Resend on a configurable schedule.
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
