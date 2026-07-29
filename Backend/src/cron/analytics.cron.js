import cron from 'node-cron';
import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService
} from '../services/analytics.service.js';

const setupAnalyticsCron = (
  scheduler = cron,
  services = {
    actionableRecommendationService: ActionableRecommendationService,
    productForecastService: ProductForecastService,
    salesForecastService: SalesForecastService,
  }
) => {
  // Tatakbo saktong 12:10 AM araw-araw
  scheduler.schedule('10 0 * * *', async () => {
    console.log('--- Cron Job Started: Refreshing AI Analytics ---');

    try {
      await services.actionableRecommendationService.getActionableRecommendations(true);

      const timeframes = ['7d', '30d', '60d'];
      for (const t of timeframes) {
        await services.productForecastService.getProductTrendsByTimeframe(t, true);
        await services.salesForecastService.getSalesTrendsByTimeframe(t, true);
      }

      console.log('--- Cron Job Finished: All analytics cached ---');
    } catch (error) {
      console.error('--- Cron Job Failed: ---', error);
    }
  });
};

export { setupAnalyticsCron };