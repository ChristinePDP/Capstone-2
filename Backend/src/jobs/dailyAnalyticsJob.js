import {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService,
} from '../services/aiAnalytics.service.js';
import { emitRealtimeChange } from '../services/realtime.service.js';
import { InventoryLogService } from '../services/inventory.service.js';

// Isang hakbang na pumalya ay hindi dapat pumigil sa susunod.
const runStep = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[DailyJob] ${label} failed:`, err?.message || err);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pinoprotektahan ang pagkakasunod-sunod: kapag tumatakbo pa ang forecast job
// (halimbawa, mabagal at inabot na ng oras ng insights job), maghihintay muna
// ang insights job sa natitira. Hindi ito gagawa ng pangalawang forecast.
let forecastRun = null;

// ==========================================
// JOB 1 — FORECASTS
// ISANG Gemini call kada forecast; 7d + 30d nang sabay.
// ==========================================
export const runForecastJob = async () => {
  if (forecastRun) return forecastRun;

  forecastRun = (async () => {
    console.log('--- Forecast Job Started ---');
    await runStep('Product forecast', () => ProductForecastService.refreshProductForecast());
    await sleep(65 * 1000); // bagong TPM window bago ang susunod na Gemini call
    await runStep('Sales forecast', () => SalesForecastService.refreshSalesForecast());
    emitRealtimeChange({ table: 'analytics', event: 'REFRESH', recordId: 'forecast-analytics' });
    console.log('--- Forecast Job Finished ---');
  })().finally(() => {
    forecastRun = null;
  });

  return forecastRun;
};

// ==========================================
// JOB 2 — INSIGHTS (tinatawag pagkatapos ng Job 1)
// Actionable Recommendations (past data + CACHED forecast mula sa Job 1)
// at Performance Summary.
// ==========================================
export const runInsightsJob = async () => {
  if (forecastRun) {
    console.log('[InsightsJob] Forecast job is still running — waiting for it to finish first.');
    await forecastRun.catch(() => {});
  }

  console.log('--- Insights Job Started ---');
  await runStep('Actionable recommendations', () =>
    ActionableRecommendationService.getActionableRecommendations(true)
  );
  await sleep(65 * 1000);
  await runStep('Performance summary', () => PerformanceSummaryService.getPerformanceSummary(true));

  emitRealtimeChange({ table: 'analytics', event: 'REFRESH', recordId: 'insights-analytics' });
  console.log('--- Insights Job Finished ---');
};

// Bilang ng minuto ng pahinga PAGKATAPOS matapos ang forecasts bago magsimula ang insights.
const INSIGHTS_DELAY_MS = 5 * 60 * 1000;

// ISANG entry point (cron at POST /run-daily): sunud-sunod, may dependency.
<<<<<<< Updated upstream
//   1) Expired inventory -> waste (exact-batch transaction)
//   2) Forecasts (Product -> Sales)           — hinihintay hanggang MATAPOS
//   3) 5 minutong pahinga (iwas TPM / quota)
//   4) Insights (Recommendations -> Performance Summary -> Homepage Ads)
// Bawat hakbang ay hinihintay matapos bago magsimula ang susunod.
=======
//   1) Forecasts (Product -> Sales)           — hinihintay hanggang MATAPOS
//   2) 5 minutong pahinga (iwas TPM / quota)
//   3) Insights (Recommendations -> Performance Summary)
// Hindi magsisimula ang step 3 hangga't hindi tapos ang step 1, kahit gaano katagal ito.
>>>>>>> Stashed changes
export const runDailyAnalyticsJob = async ({ insightsDelayMs = INSIGHTS_DELAY_MS } = {}) => {
  await runStep('Expired inventory waste', async () => {
    const result = await InventoryLogService.autoLogExpiredBatches();
    if (result.logged > 0) {
      emitRealtimeChange({ table: 'waste_logs', event: 'INSERT' });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
    }
    console.log(`[DailyJob] Auto-logged ${result.logged || 0} expired batch(es) to waste; skipped ${result.skipped || 0} incompatible batch(es).`);
  });
  await runForecastJob();
  console.log(`[DailyJob] Forecasts done — waiting ${Math.round(insightsDelayMs / 1000)}s before insights.`);
  await sleep(insightsDelayMs);
  await runInsightsJob();
};
