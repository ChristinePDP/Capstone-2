import { Router } from 'express';

import {
  FourKpiController,
  StackedBarController,
  TopProductsController
} from '../controller/analytics.controller.js';

const router = Router();

// Four KPI
router.get('/four-kpi/:timeframe', FourKpiController.getKpiByTimeframe);

// Stacked Bar
router.get('/stacked-bar/:timeframe', StackedBarController.getStackedBarByTimeframe);

// Top Products
router.get('/top-products/:timeframe', TopProductsController.getTopProducts);

export default router;