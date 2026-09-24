import { Router } from 'express';

import {
  ActionableRecommendationController,
  ProductForecastController,
  SalesForecastController,
  SummaryController
} from '../controller/aiAnalytics.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authMiddlewareJwt);

// Actionable Recommendations (3 fixed DSS categories, data window scoped per timeframe)
router.get('/actionable-recommendations/:timeframe', ActionableRecommendationController.getActionableRecommendations);

// Product Forecast
router.get('/product-forecast/:timeframe', ProductForecastController.getProductForecastByTimeframe);

// Sales Forecast
router.get('/sales-forecast/:timeframe', SalesForecastController.getSalesForecastByTimeframe);

// Performance Summary (last 7 days vs prior 7 days)
router.get('/summary', SummaryController.getPerformanceSummary);

export default router;