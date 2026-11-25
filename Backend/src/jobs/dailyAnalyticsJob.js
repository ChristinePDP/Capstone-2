import { ActionableRecommendationService } from '../services/aiAnalytics.service.js';
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

// ==========================================
// RECOMMENDATIONS JOB
// Actionable Recommendations LANG.
// WALANG forecast na tumatakbo: binabasa lang ang EXISTING forecast
// na nasa AI cache (Sales + Product). Walang Performance Summary muna.
// ==========================================
export const runRecommendationsJob = async () => {
  console.log('--- Recommendations Job Started ---');
  await runStep('Actionable recommendations', () =>
    ActionableRecommendationService.getActionableRecommendations(true)
  );
  emitRealtimeChange({ table: 'analytics', event: 'REFRESH', recordId: 'insights-analytics' });
  console.log('--- Recommendations Job Finished ---');
};

// Compatibility: kung may ibang file na nag-i-import ng runInsightsJob.
export const runInsightsJob = runRecommendationsJob;

// ISANG entry point (cron at POST /run-daily):
//   1) Expired inventory -> waste (exact-batch transaction)
//   2) Actionable Recommendations (gamit ang cached forecast)
export const runDailyAnalyticsJob = async () => {
  await runStep('Expired inventory waste', async () => {
    const result = await InventoryLogService.autoLogExpiredBatches();
    if (result.logged > 0) {
      emitRealtimeChange({ table: 'waste_logs', event: 'INSERT' });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
    }
    console.log(`[DailyJob] Auto-logged ${result.logged || 0} expired batch(es) to waste; skipped ${result.skipped || 0} incompatible batch(es).`);
  });
  await runRecommendationsJob();
};