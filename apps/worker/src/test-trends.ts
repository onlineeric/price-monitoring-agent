import { calculateTrendsForAllProducts } from './services/trendCalculator.js';

async function test() {
  console.log('Testing trend calculator...\n');

  const trends = await calculateTrendsForAllProducts();

  console.log(`\nCalculated trends for ${trends.length} products:\n`);

  trends.forEach((trend) => {
    console.log(`Product: ${trend.name}`);
    console.log(`  Current Price: ${trend.currentPrice ? (trend.currentPrice / 100).toFixed(2) : 'N/A'} ${trend.currency || ''}`);
    console.log(`  Last Checked: ${trend.lastChecked || 'Never'}`);
    console.log(`  vs Last Check: ${trend.vsLastCheck ? trend.vsLastCheck.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 7d Avg: ${trend.vs7dAvg ? trend.vs7dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 30d Avg: ${trend.vs30dAvg ? trend.vs30dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 90d Avg: ${trend.vs90dAvg ? trend.vs90dAvg.toFixed(1) + '%' : 'N/A'}`);
    console.log(`  vs 180d Avg: ${trend.vs180dAvg ? trend.vs180dAvg.toFixed(1) + '%' : 'N/A'}`);

    if (trend.lastFailed && trend.lastChecked && trend.lastFailed > trend.lastChecked) {
      console.log(`  ⚠️ Last update FAILED`);
    }

    console.log('');
  });
}

test().catch(console.error);
