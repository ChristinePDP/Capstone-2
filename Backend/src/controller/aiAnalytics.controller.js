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
  getActionableRecommendations: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      const forceRefresh = req.query.refresh === 'true';
      const result = await ActionableRecommendationService.getActionableRecommendations(timeframe, forceRefresh);
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