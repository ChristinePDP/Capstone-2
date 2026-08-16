import { Router } from 'express';

import {
  ActionableRecommendationController,
  ProductForecastController,
  SalesForecastController,
  SummaryController
} from '../controller/aiAnalytics.controller.js';

const router = Router();

// Actionable Recommendations (3 fixed DSS categories, data window scoped per timeframe)
router.get('/actionable-recommendations/:timeframe', ActionableRecommendationController.getActionableRecommendations);

// Product Forecast
router.get('/product-forecast/:timeframe', ProductForecastController.getProductForecastByTimeframe);

// Sales Forecast
router.get('/sales-forecast/:timeframe', SalesForecastController.getSalesForecastByTimeframe);

// Performance Summary (last 7 days vs prior 7 days)
router.get('/summary', SummaryController.getPerformanceSummary);

export default router;