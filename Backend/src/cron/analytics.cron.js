import cron from 'node-cron';
import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';

// IMPORT NATIN YUNG BAGONG FUNCTIONS PARA SA ADS
// - generateHomepageAds: laging tumatakbo, best sellers lang basehan
// - generateEventAds: may internal check kung may LIVE occasion ngayon
//   (isOccasionLiveToday). Kapag wala, sya rin ang naglilinis ng
//   'event_ads_homepage' cache papuntang { active: false } — kaya safe
//   siyang tawagin kahit walang event, hindi na kailangan ng dagdag
//   na if-check dito sa cron.
import { generateHomepageAds, generateEventAds } from '../services/productAndEvent.service.js'; 

const setupAnalyticsCron = (
  scheduler = cron,
  services = {
    actionableRecommendationService: ActionableRecommendationService,
    productForecastService: ProductForecastService,
    salesForecastService: SalesForecastService,
    performanceSummaryService: PerformanceSummaryService,
  }
) => {
  // TEMPORARY TESTING: Naka-set sa '* * * * *' para tumakbo EVERY MINUTE.
  // Kapag nakita mo na pumasok na sa Supabase analytics_cache table yung data,
  // palitan mo ito ng '10 0 * * *' para tumakbo tuwing 12:10 AM araw-araw.
  scheduler.schedule('10 * * * *', async () => {
    console.log('--- Cron Job Started: Refreshing AI Analytics & Homepage Ads ---');
    try {
      // 1. Refresh internal analytics (Sales & Forecasts)
      await services.actionableRecommendationService.getActionableRecommendations(true);
      const timeframes = ['7d', '30d', '60d'];
      for (const t of timeframes) {
        await services.productForecastService.getProductTrendsByTimeframe(t, true);
        await services.salesForecastService.getSalesTrendsByTimeframe(t, true);
      }

      // 1b. Refresh Performance Summary (last 7 days vs prior 7 days)
      await services.performanceSummaryService.getPerformanceSummary(true);
      
      // 2. Best Sellers homepage ads — laging na-re-refresh, walang
      // occasion-dependency ito.
      console.log('Generating Homepage Ads (Best Sellers) via Gemini...');
      await generateHomepageAds();

      // 3. Event Ads Modal — dito nangyayari yung rule na gusto mo:
      // titignan muna ng generateEventAds() (via isOccasionLiveToday) kung
      // may occasion na LIVE ngayon base sa 'occasions' table. Kung meron,
      // saka lang sya mag-a-analyze ng mga products na naka-tag dun at
      // tatawag ng Gemini para sa copy. Kung wala, ang cache mismo ang
      // nagli-clear papuntang { active: false } sa loob ng function na ito
      // — kaya hindi lalabas ang modal kapag walang live event.
      console.log('Checking for live occasion & generating Event Ads...');
      await generateEventAds();

      console.log('--- Cron Job Finished: All analytics & ads cached ---');
    } catch (error) {
      console.error('--- Cron Job Failed: ---', error);
    }
  });

  // Tandaan: TINANGGAL NA NATIN YUNG SAFETY-NET BATCH TAGGING DITO.
};

export { setupAnalyticsCron };