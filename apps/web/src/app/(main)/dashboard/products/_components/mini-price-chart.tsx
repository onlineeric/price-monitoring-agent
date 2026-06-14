"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface MiniPriceChartProps {
  data: Array<{
    date: Date;
    price: number;
  }>;
}

/**
 * Compute a tight y-axis domain padded around the actual price range.
 *
 * Recharts defaults the axis to start at 0, which squeezes the line into a thin
 * band near the top and makes even large (25–50%) price swings look flat. This
 * zooms the axis to the data so movements read clearly. Padding is 15% of the
 * range, or 5% of the value (min 1) when prices are flat so a single/constant
 * price still gets a sensible band instead of a zero-height domain.
 */
export function computePriceDomain(prices: number[]): [number, number] {
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const range = maxPrice - minPrice;
  const padding = range > 0 ? range * 0.15 : Math.max(maxPrice * 0.05, 1);
  return [minPrice - padding, maxPrice + padding];
}

export function MiniPriceChart({ data }: MiniPriceChartProps) {
  // Transform data for recharts
  const chartData = data.map((item) => ({
    date: item.date.toISOString(),
    price: item.price / 100, // Convert cents to dollars
  }));

  // Determine if trend is up or down
  const firstPrice = chartData[0]?.price || 0;
  const lastPrice = chartData[chartData.length - 1]?.price || 0;
  const isUpTrend = lastPrice > firstPrice;

  // Zoom the y-axis to the actual price range so small movements read clearly.
  const yDomain = computePriceDomain(chartData.map((item) => item.price));

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <YAxis hide domain={yDomain} />
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isUpTrend ? "#ef4444" : "#10b981"} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isUpTrend ? "#ef4444" : "#10b981"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="price"
            stroke={isUpTrend ? "#ef4444" : "#10b981"}
            strokeWidth={2}
            fill="url(#priceGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
