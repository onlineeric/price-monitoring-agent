import { db, eq, gte, priceRecords, products, sql } from "@price-monitor/db";
import { subDays } from "date-fns";
import { Activity, Bot, Clock, Database, DollarSign, Globe, Mail, Package, Theater, TrendingUp, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { ManualTriggerButton } from "./_components/manual-trigger-button";
import { getProductOverview, ProductOverview } from "./_components/product-overview";

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
  const [stats, productOverview] = await Promise.all([getDashboardStats(), getProductOverview()]);

  const formatPrice = (cents: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
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
          This AI-powered agent monitors product prices from any URL using a 2-tier extraction pipeline: fast HTML
          parsing with an intelligent Playwright + AI fallback that understands page structure to extract prices
          accurately. Price history is stored in PostgreSQL, and automated email digests with trend analysis are sent on
          a configurable schedule.
        </p>
        <p className="mb-4 text-muted-foreground">
          This project is a portfolio project demonstrating my full-stack development, AI Agent integration, background job processing and production deployment skills.
        </p>
        <h3 className="mb-2 font-semibold text-lg">Tech Stack & Source</h3>
        <table className="mb-4 text-base text-muted-foreground">
          <tbody>
            <tr>
              <td className="pr-3 py-0.5 text-right whitespace-nowrap">My GitHub profile:</td>
              <td className="py-0.5">
                <a href="https://github.com/onlineeric" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
                  https://github.com/onlineeric
                </a>
              </td>
            </tr>
            <tr>
              <td className="pr-3 py-0.5 text-right whitespace-nowrap">Git repository of this project:</td>
              <td className="py-0.5">
                <a href="https://github.com/onlineeric/price-monitoring-agent" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
                  https://github.com/onlineeric/price-monitoring-agent
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2">
          <img src="https://img.shields.io/badge/-Next.js%2016-4A4A4A?logo=next.js&logoColor=white&style=for-the-badge" alt="Next.js 16" />
          <img src="https://img.shields.io/badge/-TypeScript-007ACC?logo=typescript&logoColor=white&style=for-the-badge" alt="TypeScript" />
          <img src="https://img.shields.io/badge/-Playwright-2EAD33?logo=playwright&logoColor=white&style=for-the-badge" alt="Playwright" />
          <img src="https://img.shields.io/badge/-AI%20Agent-FF6F00?logo=openai&logoColor=white&style=for-the-badge" alt="AI Agent" />
          <img src="https://img.shields.io/badge/-BullMQ-DC382C?logo=redis&logoColor=white&style=for-the-badge" alt="BullMQ" />
          <img src="https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white&style=for-the-badge" alt="PostgreSQL" />
          <img src="https://img.shields.io/badge/-Resend-7C3AED?logo=resend&logoColor=white&style=for-the-badge" alt="Resend" />
          <img src="https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white&style=for-the-badge" alt="Docker" />
          <img src="https://img.shields.io/badge/-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white&style=for-the-badge" alt="GitHub Actions" />
        </div>
      </div>

      {/* Product Overview Section */}
      <ProductOverview products={productOverview} />
    </div>
  );
}
