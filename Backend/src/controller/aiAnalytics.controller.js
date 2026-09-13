import { ok } from '../utils/response.js';
import { 
  ActionableRecommendationService, 
  ProductForecastService, 
  SalesForecastService,
  PerformanceSummaryService
} from '../services/aiAnalytics.service.js';

// ==========================================
// Controllers
// ==========================================

const ActionableRecommendationController = {
  // No longer reads a :timeframe route param — recommendations are a
  // single, timeframe-independent set now (see ActionableRecommendationService).
  // NOTE: update the route definition too, e.g.
  //   GET /actionable-recommendations           (was /actionable-recommendations/:timeframe)
  getActionableRecommendations: async (req, res, next) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const result = await ActionableRecommendationService.getActionableRecommendations(forceRefresh);
      ok(res, result, 'Actionable recommendations fetched successfully');
    } catch (err) {
      next(err);
    }
  },
};

const ProductForecastController = {
  getProductForecastByTimeframe: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      const forceRefresh = req.query.refresh === 'true';

      const result = await ProductForecastService.getProductTrendsByTimeframe(timeframe, forceRefresh);
      ok(res, result, 'Product forecast fetched successfully');
    } catch (err) {
      next(err);
    }
  },

  // Single-shot cron entry point. One Gemini call produces BOTH the
  // 7-day and 30-day horizons together, so call this ONE route instead
  // of /product-forecast/7d?refresh=true AND /product-forecast/30d?refresh=true.
  refreshProductForecast: async (req, res, next) => {
    try {
      const result = await ProductForecastService.refreshProductForecast();
      ok(res, result, 'Product forecast refreshed successfully');
    } catch (err) {
      next(err);
    }
  },
};

const SalesForecastController = {
  getSalesForecastByTimeframe: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      const forceRefresh = req.query.refresh === 'true';

      const result = await SalesForecastService.getSalesTrendsByTimeframe(timeframe, forceRefresh);
      ok(res, result, 'Sales forecast fetched successfully');
    } catch (err) {
      next(err);
    }
  },

  // Single-shot cron entry point. Generation is unified now (it decides
  // internally whether to produce the 30-day or 7-day series) so the
  // cron job only needs to call this ONE route instead of hitting
  // /sales-forecast/7d?refresh=true AND /sales-forecast/30d?refresh=true
  // separately, which would just repeat the same resolution twice.
  refreshSalesForecast: async (req, res, next) => {
    try {
      const result = await SalesForecastService.refreshSalesForecast();
      ok(res, result, 'Sales forecast refreshed successfully');
    } catch (err) {
      next(err);
    }
  },
};

const SummaryController = {
  getPerformanceSummary: async (req, res, next) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const result = await PerformanceSummaryService.getPerformanceSummary(forceRefresh);
      ok(res, result, 'Performance summary fetched successfully');
    } catch (err) {
      next(err);
    }
  },
};

export {
  ActionableRecommendationController,
  ProductForecastController,
  SalesForecastController,
  SummaryController
};