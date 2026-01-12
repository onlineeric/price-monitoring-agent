# Technical Spec: Phase 5.1 - Dashboard Home Page

**Phase:** 5.1
**Goal:** Build the dashboard home page with summary statistics cards and a "Check All & Send Email" button.
**Context:** This is the main landing page of the Price Monitor dashboard. It should display at-a-glance statistics about monitored products and provide a manual trigger for checking all prices and sending the digest email.

---

## Prerequisites

* **Task 5.0:** Dashboard template setup complete.
* **Database:** Products and price records exist.
* **Phase 4:** Email infrastructure complete (for manual digest trigger).

---

## Architecture Context

### Dashboard Home Features

**Summary Statistics:**
- Total Products: Count of active products being monitored
- Total Price Checks: Count of all price records
- Average Price: Average current price across all products
- Recent Changes: Count of price changes in last 24 hours

**Manual Trigger:**
- "Check All & Send Email" button
- Triggers manual digest flow (same as automated cron job)
- Shows loading state while processing
- Displays success/error toast notification

**Design:**
- Uses template's Card components for consistent styling
- Responsive grid layout (4 columns on large screens, 2 on medium, 1 on small)
- Follows template's design patterns (badges, icons, colors)

---

## Step 1: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to implement the dashboard home page.

### File 1.1: `apps/web/src/app/(main)/dashboard/page.tsx`

**Goal:** Main dashboard page with statistics and manual trigger.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, products, priceRecords } from '@price-monitor/db';
  import { eq, desc, gte, sql } from 'drizzle-orm';
  import { TrendingDown, TrendingUp, Package, DollarSign, Activity, Clock } from 'lucide-react';
  import { subDays } from 'date-fns';

  import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { ManualTriggerButton } from './_components/manual-trigger-button';
  ```

* **Data Fetching Function:**
  ```typescript
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
  ```

* **Page Component:**
  ```typescript
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
  ```

### File 1.2: `apps/web/src/app/(main)/dashboard/_components/manual-trigger-button.tsx`

**Goal:** Button component to manually trigger "Check All & Send Email".

**Requirements:**

* **"use client" directive** (interactive component)

* **Imports:**
  ```typescript
  'use client';

  import { useState } from 'react';
  import { Mail } from 'lucide-react';

  import { Button } from '@/components/ui/button';
  import { toast } from 'sonner';
  ```

* **Component Implementation:**
  ```typescript
  export function ManualTriggerButton() {
    const [loading, setLoading] = useState(false);

    const handleTrigger = async () => {
      setLoading(true);

      try {
        const response = await fetch('/api/digest/trigger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (response.ok) {
          toast.success('Digest triggered successfully!', {
            description: 'All products will be checked and email will be sent.',
          });
        } else {
          toast.error('Failed to trigger digest', {
            description: data.error || 'Unknown error occurred',
          });
        }
      } catch (error) {
        toast.error('Failed to trigger digest', {
          description: error instanceof Error ? error.message : 'Network error',
        });
      } finally {
        setLoading(false);
      }
    };

    return (
      <Button
        onClick={handleTrigger}
        disabled={loading}
        className="gap-2"
        size="lg"
      >
        <Mail className="size-4" />
        {loading ? 'Triggering...' : 'Check All & Send Email'}
      </Button>
    );
  }
  ```

### File 1.3: `apps/web/src/app/api/digest/trigger/route.ts`

**Goal:** API endpoint to trigger manual digest email.

**Requirements:**

* **Imports:**
  ```typescript
  import { NextResponse } from 'next/server';
  import { Queue } from 'bullmq';
  import { Redis } from 'ioredis';
  ```

* **API Handler:**
  ```typescript
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue('price-monitor-queue', {
    connection: redis,
  });

  export async function POST() {
    try {
      // Enqueue digest job
      const job = await queue.add('send-digest', {
        triggeredBy: 'manual',
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        jobId: job.id,
        message: 'Digest job enqueued successfully',
      });
    } catch (error) {
      console.error('[API] Error enqueueing digest job:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to enqueue digest job',
        },
        { status: 500 }
      );
    }
  }
  ```

**Note:** This endpoint will enqueue a `send-digest` job that will be implemented in Phase 6.2. For now, it just enqueues the job.

---

## Step 2: Verification (Manual Step)

### 2.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

### 2.2: Verify Dashboard Display

Open `http://localhost:3000/dashboard` and verify:

- [ ] Dashboard loads without errors
- [ ] All 4 stat cards display correctly
- [ ] Total Products shows correct count
- [ ] Total Price Checks shows correct count
- [ ] Average Price shows formatted currency (or N/A if no products)
- [ ] Recent Changes shows count of products with changes in last 24h
- [ ] Info section displays at bottom
- [ ] "Check All & Send Email" button appears in header

### 2.3: Test Manual Trigger Button

1. Click "Check All & Send Email" button
2. Verify button shows "Triggering..." loading state
3. Check browser console for API call
4. Verify toast notification appears

**Expected:** Success toast shows "Digest triggered successfully!"

**Note:** The actual digest job processing will be implemented in Phase 6.2. For now, the job is just enqueued.

### 2.4: Test with No Products

If you have no products in the database:

- [ ] Dashboard should show 0 for all stats
- [ ] Average Price should show "N/A"
- [ ] No errors should occur

### 2.5: Test Responsive Layout

Resize browser window to verify:

- [ ] 4 columns on large screens (>= 1280px)
- [ ] 2 columns on medium screens (>= 768px)
- [ ] 1 column on small screens (< 768px)
- [ ] All cards remain readable and properly spaced

---

## File Structure After Completion

```
apps/web/src/app/(main)/dashboard/
├── page.tsx                          # UPDATED: Dashboard home with stats
├── _components/
│   └── manual-trigger-button.tsx    # NEW: Manual trigger button
├── products/
│   └── page.tsx                      # (Placeholder from Task 5.0)
└── settings/
    └── page.tsx                      # (Placeholder from Task 5.0)

apps/web/src/app/api/
├── digest/
│   └── trigger/
│       └── route.ts                  # NEW: Manual digest trigger API
└── debug/
    └── trigger/
        └── route.ts                  # (Existing from migration)
```

---

## Styling Notes

**Card Design:**
- Uses template's Card component for consistent styling
- CardHeader contains icon, description, and title
- CardAction for badges (trending indicators)
- CardFooter for additional context

**Color Scheme:**
- Uses template's theme colors
- Success/positive: green tones
- Neutral: muted text colors
- Interactive: primary button colors

**Typography:**
- Large numbers: `text-3xl font-semibold tabular-nums`
- Descriptions: `text-muted-foreground`
- Headers: `text-3xl font-bold`

---

## Troubleshooting

### Issue: Stats show incorrect numbers

**Cause:** Database query issue or missing data.

**Solution:** Check database using Drizzle Studio. Verify products and priceRecords tables have data.

### Issue: Manual trigger button doesn't work

**Cause:** API endpoint not found or Redis connection issue.

**Solution:**
1. Verify `/api/digest/trigger` route exists
2. Check `REDIS_URL` environment variable
3. Ensure Redis is running (locally or Upstash)

### Issue: Toast notifications don't appear

**Cause:** Toaster component not in layout or sonner not installed.

**Solution:** Verify `apps/web/src/app/layout.tsx` includes `<Toaster />` component from `@/components/ui/sonner`.

### Issue: Build fails with TypeScript errors

**Cause:** Type mismatches in database queries.

**Solution:** Ensure `@price-monitor/db` package is properly installed and types are exported correctly.

---

## Completion Criteria

Task 5.1 is complete when:

- [ ] Dashboard page displays 4 stat cards
- [ ] Total Products stat shows correct count
- [ ] Total Price Checks stat shows correct count
- [ ] Average Price stat shows formatted currency
- [ ] Recent Changes stat shows count of products with changes
- [ ] Manual trigger button appears in header
- [ ] Button triggers API call to `/api/digest/trigger`
- [ ] Toast notification shows on success/error
- [ ] Loading state works correctly on button
- [ ] Info section displays at bottom
- [ ] Responsive layout works (4/2/1 columns)
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Build completes successfully

---

## Performance Notes

- All stats are calculated server-side using Server Components
- No client-side data fetching or loading states for stats
- Stats are cached until page reload (Next.js default behavior)
- For real-time updates, consider adding a "Refresh" button or auto-refresh

---

## Future Enhancements (Out of Scope)

- Real-time stat updates using Server-Sent Events
- Charts showing price trends over time
- Recent activity feed
- Quick actions (add product, view latest checks)
- Customizable stat cards
- Export dashboard data to CSV
