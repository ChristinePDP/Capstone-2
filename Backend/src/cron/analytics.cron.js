import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';

import { generateHomepageAds, generateEventAds } from '../services/productAndEvent.service.js';
import { cleanupExpiredPendingOrders } from '../services/onlineOrdering.services.js';

// Dati: `cron.schedule(...)` sa loob ng process — nawawala pag natutulog ang free-tier service.
// Ngayon: plain async function na lang ito. Si Render Cron Job na ang bahalang
// mag-trigger nito via HTTP, sa oras na itinakda mo sa Render dashboard.
export const runAnalyticsRefresh = async () => {
  console.log('--- Cron Job Started: Refreshing AI Analytics & Homepage Ads ---');
  try {
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

    console.log('--- Cron Job Finished: All analytics & ads cached ---');
    return { ok: true, finishedAt: new Date().toISOString() };
  } catch (error) {
    console.error('--- Cron Job Failed: ---', error);
    throw error;
  }
};