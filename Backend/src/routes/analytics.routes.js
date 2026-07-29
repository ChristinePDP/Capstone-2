import { Router } from 'express';


import {
  ActionableRecommendationController,
  FourKpiController,
  ProductForecastController,
  SalesForecastController,
  StackedBarController,
  TopProductsController
} from '../controller/analytics.controller.js';

const router = Router();


// Actionable Recommendations
router.get('/actionable-recommendations/:timeframe', ActionableRecommendationController.getActionableRecommendations);

// Four KPI
router.get('/four-kpi/:timeframe', FourKpiController.getKpiByTimeframe);

// Product Forecast
router.get('/product-forecast/:timeframe', ProductForecastController.getProductForecastByTimeframe);

// Sales Forecast
router.get('/sales-forecast/:timeframe', SalesForecastController.getSalesForecastByTimeframe);

// Stacked Bar
router.get('/stacked-bar/:timeframe', StackedBarController.getStackedBarByTimeframe);

// Top Products
router.get('/top-products/:timeframe', TopProductsController.getTopProducts);

export default router;