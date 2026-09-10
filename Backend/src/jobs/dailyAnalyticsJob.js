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

  // Forecasting only supports these two windows now (60d was removed).
  const timeframes = ['7d', '30d'];

  // STEP 1: Forecasts must run FIRST. Actionable Recommendations reads
  // their cached output for this same run — if it ran before this, it
  // would see yesterday's forecast (or none at all on a first-ever run).
  console.log('Generating Product & Sales Forecasts...');
  for (const t of timeframes) {
    await ProductForecastService.getProductTrendsByTimeframe(t, true);
    await SalesForecastService.getSalesTrendsByTimeframe(t, true);
  }

  // STEP 2: Actionable Recommendations — only after the forecasts above
  // have completed. Each call must pass (timeframe, forceRefresh) in
  // that order — not a single `true`, which used to be misread as the
  // timeframe itself.
  console.log('Generating Actionable Recommendations...');
  for (const t of timeframes) {
    await ActionableRecommendationService.getActionableRecommendations(t, true);
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