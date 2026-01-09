'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface MiniPriceChartProps {
  data: Array<{
    date: Date;
    price: number;
  }>;
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

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={isUpTrend ? '#ef4444' : '#10b981'}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={isUpTrend ? '#ef4444' : '#10b981'}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="price"
            stroke={isUpTrend ? '#ef4444' : '#10b981'}
            strokeWidth={2}
            fill="url(#priceGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
