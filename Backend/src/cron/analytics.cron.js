import cron from 'node-cron';
import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';

import { generateHomepageAds, generateEventAds } from '../services/productAndEvent.service.js';
import { cleanupExpiredPendingOrders } from '../services/onlineOrdering.service.js';

// Bumalik tayo sa Option A: cron logic na tumatakbo sa loob mismo ng Express app.
// Walang extra Render service, walang dagdag na $1/month.
// Trade-off: kung natutulog ang free-tier Web Service dahil sa inactivity,
// hindi tatakbo ang job sa eksaktong 12am hangga't walang traffic na
// gumising sa service. Para sa capstone/demo, karaniwang okay lang ito.
export const setupAnalyticsCron = (
  scheduler = cron,
  services = {
    actionableRecommendationService: ActionableRecommendationService,
    productForecastService: ProductForecastService,
    salesForecastService: SalesForecastService,
    performanceSummaryService: PerformanceSummaryService,
  }
) => {
  // '0 0 * * *' = 12:00 AM, araw-araw.
  // timezone: 'Asia/Manila' — pinapasok na dito ang tamang oras, hindi na
  // kailangan i-convert manually sa UTC gaya ng ginawa natin sa Render Cron Job.
  scheduler.schedule(
    '0 0 * * *',
    async () => {
      console.log('--- Cron Job Started: Refreshing AI Analytics & Homepage Ads ---');
      try {
        await services.actionableRecommendationService.getActionableRecommendations(true);

        const timeframes = ['7d', '30d', '60d'];
        for (const t of timeframes) {
          await services.productForecastService.getProductTrendsByTimeframe(t, true);
          await services.salesForecastService.getSalesTrendsByTimeframe(t, true);
        }

        await services.performanceSummaryService.getPerformanceSummary(true);

        console.log('Generating Homepage Ads (Best Sellers) via Gemini...');
        await generateHomepageAds();

        console.log('Checking for live occasion & generating Event Ads...');
        await generateEventAds();

        console.log('Cleaning up expired pending checkouts...');
        await cleanupExpiredPendingOrders();

        console.log('--- Cron Job Finished: All analytics & ads cached ---');
      } catch (error) {
        console.error('--- Cron Job Failed: ---', error);
      }
    },
    { timezone: 'Asia/Manila' }
  );
};