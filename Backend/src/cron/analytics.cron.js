import cron from 'node-cron';
import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';

import { generateHomepageAds, generateEventAds } from '../services/productAndEvent.service.js'; 
// 1. I-import yung ginawa mong cleanup function
import { cleanupExpiredPendingOrders } from '../services/onlineOrdering.services.js';

const setupAnalyticsCron = (
  scheduler = cron,
  services = {
    actionableRecommendationService: ActionableRecommendationService,
    productForecastService: ProductForecastService,
    salesForecastService: SalesForecastService,
    performanceSummaryService: PerformanceSummaryService,
  }
) => {
  scheduler.schedule('10 * * * *', async () => {
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

      // 2. IDAGDAG ITO: I-run ang cleanup para sa abandoned orders
      console.log('Cleaning up expired pending checkouts...');
      await cleanupExpiredPendingOrders();

      console.log('--- Cron Job Finished: All analytics & ads cached ---');
    } catch (error) {
      console.error('--- Cron Job Failed: ---', error);
    }
  });
};

export { setupAnalyticsCron };