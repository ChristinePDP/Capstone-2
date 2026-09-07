import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';
import { generateHomepageAds, generateEventAds } from '../services/productAndEvent.service.js';
import { cleanupExpiredPendingOrders } from '../services/onlineOrdering.service.js';

export const runDailyAnalyticsJob = async () => {
  console.log('--- Daily Analytics Job Started ---');

  await ActionableRecommendationService.getActionableRecommendations(true);

  const timeframes = ['7d', '30d', '60d'];
  for (const t of timeframes) {
    await ProductForecastService.getProductTrendsByTimeframe(t, true);
    await SalesForecastService.getSalesTrendsByTimeframe(t, true);
  }

  await PerformanceSummaryService.getPerformanceSummary(true);

  console.log('Generating Homepage Ads (Best Sellers) via Gemini...');
  await generateHomepageAds();

  console.log('Checking for live occasion & generating Event Ads...');
  await generateEventAds();

  console.log('Cleaning up expired pending checkouts...');
  await cleanupExpiredPendingOrders();

  console.log('--- Daily Analytics Job Finished ---');
};