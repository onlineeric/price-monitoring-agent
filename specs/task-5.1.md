# Technical Spec: Phase 5.1 - Public Dashboard

**Phase:** 5.1
**Goal:** Build a public dashboard UI that displays all monitored products with price history and charts.
**Context:** Users need to see all products being monitored, their current prices, price history charts, and basic statistics. This is a read-only public view (no authentication required).

---

## Prerequisites

* **Task 4.2:** Email infrastructure and settings complete.
* **Database:** Products and price records exist.

---

## Architecture Context

### Dashboard Features

**Public Read-Only View:**
- Display all active products in cards/grid
- Show product image, name, current price
- Price history chart (last 30-90 days)
- Basic stats: highest, lowest, average price
- Link to product URL

**No Authentication:**
- Fully public dashboard
- Anyone can view product prices
- Admin features (add/edit) in Phase 5.2

---

## Step 1: Install Dependencies (Manual Step)

**User Action:**

```bash
cd apps/web

# Install charting library
pnpm add recharts

# Install date utilities
pnpm add date-fns
```

---

## Step 2: Implementation Specifications (AI Generation Step)

**Instruction for AI:**

Generate the following files to create the public dashboard.

### File 2.1: `apps/web/src/app/page.tsx`

**Goal:** Main dashboard page that fetches and displays all products.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, products, priceRecords } from '@price-monitor/db';
  import { eq, desc } from 'drizzle-orm';
  import ProductCard from '@/components/ProductCard';
  ```

* **Data Fetching:**
  ```typescript
  async function getProductsWithLatestPrice() {
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(desc(products.createdAt));

    // For each product, get latest price
    const productsWithPrices = await Promise.all(
      allProducts.map(async (product) => {
        const [latestPrice] = await db
          .select()
          .from(priceRecords)
          .where(eq(priceRecords.productId, product.id))
          .orderBy(desc(priceRecords.scrapedAt))
          .limit(1);

        return {
          ...product,
          latestPrice: latestPrice || null,
        };
      })
    );

    return productsWithPrices;
  }
  ```

* **Page Component:**
  ```typescript
  export default async function DashboardPage() {
    const products = await getProductsWithLatestPrice();

    return (
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Price Monitor</h1>
          <p className="text-gray-600 mb-8">
            Tracking {products.length} product{products.length !== 1 ? 's' : ''}
          </p>

          {products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No products being monitored yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }
  ```

### File 2.2: `apps/web/src/components/ProductCard.tsx`

**Goal:** Display individual product card with current price and chart.

**Requirements:**

* **Imports:**
  ```typescript
  import { db, priceRecords } from '@price-monitor/db';
  import { eq, desc, gte } from 'drizzle-orm';
  import { subDays } from 'date-fns';
  import PriceChart from './PriceChart';
  import Link from 'next/link';
  ```

* **Props Interface:**
  ```typescript
  interface ProductCardProps {
    product: {
      id: string;
      url: string;
      name: string;
      imageUrl: string | null;
      lastSuccessAt: Date | null;
      lastFailedAt: Date | null;
      latestPrice?: {
        price: number;
        currency: string;
        scrapedAt: Date;
      } | null;
    };
  }
  ```

* **Fetch Price History:**
  ```typescript
  async function getPriceHistory(productId: string) {
    const thirtyDaysAgo = subDays(new Date(), 30);

    const history = await db
      .select()
      .from(priceRecords)
      .where(
        eq(priceRecords.productId, productId),
        gte(priceRecords.scrapedAt, thirtyDaysAgo)
      )
      .orderBy(desc(priceRecords.scrapedAt))
      .limit(100);

    return history;
  }
  ```

* **Component Implementation:**
  ```typescript
  export default async function ProductCard({ product }: ProductCardProps) {
    const priceHistory = await getPriceHistory(product.id);

    // Calculate stats
    const prices = priceHistory.map(p => p.price);
    const highest = prices.length > 0 ? Math.max(...prices) : null;
    const lowest = prices.length > 0 ? Math.min(...prices) : null;
    const average = prices.length > 0
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null;

    // Format price helper
    const formatPrice = (cents: number | null, currency: string | null) => {
      if (cents === null || !currency) return 'N/A';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(cents / 100);
    };

    // Check if last update failed
    const lastFailed = product.lastFailedAt && product.lastSuccessAt
      ? product.lastFailedAt > product.lastSuccessAt
      : false;

    return (
      <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
        {/* Product image */}
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-48 object-cover rounded mb-4"
          />
        )}

        {/* Product name and link */}
        <h3 className="font-bold text-lg mb-2 line-clamp-2">
          <Link
            href={product.url}
            target="_blank"
            className="hover:text-blue-600"
          >
            {product.name}
          </Link>
        </h3>

        {/* Current price */}
        <div className="mb-4">
          {product.latestPrice ? (
            <div className="text-3xl font-bold text-green-600">
              {formatPrice(product.latestPrice.price, product.latestPrice.currency)}
            </div>
          ) : (
            <div className="text-gray-500">No price data</div>
          )}

          {lastFailed && (
            <div className="text-red-500 text-sm mt-1">
              ⚠️ Failed to update
            </div>
          )}
        </div>

        {/* Price stats */}
        {prices.length > 0 && (
          <div className="text-sm text-gray-600 mb-4">
            <div>High: {formatPrice(highest, product.latestPrice?.currency)}</div>
            <div>Low: {formatPrice(lowest, product.latestPrice?.currency)}</div>
            <div>Avg: {formatPrice(average, product.latestPrice?.currency)}</div>
          </div>
        )}

        {/* Price chart */}
        {priceHistory.length > 0 && (
          <PriceChart
            data={priceHistory}
            currency={product.latestPrice?.currency || 'USD'}
          />
        )}
      </div>
    );
  }
  ```

### File 2.3: `apps/web/src/components/PriceChart.tsx`

**Goal:** Render a simple line chart of price history using Recharts.

**Requirements:**

* **"use client" directive** (Recharts requires client-side rendering)

* **Imports:**
  ```typescript
  'use client';

  import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
  } from 'recharts';
  import { format } from 'date-fns';
  ```

* **Props Interface:**
  ```typescript
  interface PriceChartProps {
    data: Array<{
      price: number;
      scrapedAt: Date;
    }>;
    currency: string;
  }
  ```

* **Component Implementation:**
  ```typescript
  export default function PriceChart({ data, currency }: PriceChartProps) {
    // Transform data for Recharts (reverse to show oldest first)
    const chartData = [...data]
      .reverse()
      .map((record) => ({
        date: record.scrapedAt.getTime(),
        price: record.price / 100, // Convert cents to dollars
      }));

    // Format tooltip
    const formatTooltip = (value: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(value);
    };

    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM d')}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `${value.toFixed(0)}`}
            />
            <Tooltip
              formatter={formatTooltip}
              labelFormatter={(timestamp) =>
                format(new Date(timestamp), 'MMM d, yyyy')
              }
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```

---

## Step 3: Verification (Manual Step)

### 3.1: Start Development Server

```bash
cd apps/web
pnpm dev
```

Open browser at `http://localhost:3000`

### 3.2: Verify Dashboard Display

Check that:
- [x] All active products are displayed in cards
- [x] Product images show (if available)
- [x] Product names link to external URLs
- [x] Current prices display correctly
- [x] Price stats (high/low/avg) calculate correctly
- [x] Price charts render with last 30 days of data
- [x] Failed products show warning indicator

### 3.3: Test with No Products

If database has no products, verify:
- [x] "No products being monitored yet" message appears
- [x] No errors in console

### 3.4: Test Responsive Layout

Resize browser window to verify:
- [x] Grid layout adjusts (3 cols → 2 cols → 1 col)
- [x] Charts remain responsive
- [x] Cards maintain proper spacing

---

## File Structure After Completion

```
apps/web/src/
├── app/
│   └── page.tsx              # UPDATED: Dashboard with products
└── components/
    ├── ProductCard.tsx       # NEW: Product card component
    └── PriceChart.tsx        # NEW: Price chart component
```

---

## Styling Notes

The implementation uses Tailwind CSS classes. Ensure your `tailwind.config.js` is properly configured.

If you want to customize the design:
- Card styles: `apps/web/src/components/ProductCard.tsx`
- Chart colors: `stroke` prop in `PriceChart.tsx`
- Grid layout: `grid-cols-*` classes in `page.tsx`

---

## Troubleshooting

### Issue: "use client" error

**Cause:** Recharts requires client-side rendering but component is server-side.

**Solution:** Ensure `PriceChart.tsx` has `'use client';` at the top.

### Issue: Chart not displaying

**Cause:** No price history data or incorrect data format.

**Solution:** Check that `priceRecords` table has data and dates are valid Date objects.

### Issue: Images not loading

**Cause:** Product images may be from external domains.

**Solution:** Add image domains to `next.config.ts`:
```typescript
images: {
  domains: ['example.com', 'another-site.com'],
}
```

Or use `<img>` tag instead of Next.js `<Image>` component (as shown in the spec).

---

## Completion Criteria

Task 5.1 is complete when:

- [ ] `recharts` and `date-fns` packages installed
- [ ] Dashboard page displays all active products
- [ ] ProductCard component shows product details and stats
- [ ] PriceChart component renders price history
- [ ] Failed products show warning indicator
- [ ] Product names link to external URLs
- [ ] Charts are responsive and display correctly
- [ ] Grid layout is responsive (1-3 columns based on screen size)
- [ ] No console errors
- [ ] Dashboard loads quickly (< 2 seconds)

---

## Performance Notes

- Server Components fetch data on each request (no caching yet)
- For better performance in production, consider:
  - Adding revalidation: `export const revalidate = 60;` (cache for 60 seconds)
  - Using Incremental Static Regeneration (ISR)
  - Implementing pagination if product count grows large

---

## Future Enhancements (Out of Scope)

- Search/filter products
- Sort by price/name/date
- Pagination for large product lists
- Individual product detail pages
- Export price history to CSV
