import { Router } from 'express';

import {
  FourKpiController,
  StackedBarController,
} from '../controller/analytics.controller.js';

const router = Router();

// Four KPI
router.get('/four-kpi/:timeframe', FourKpiController.getKpiByTimeframe);

// Stacked Bar
router.get('/stacked-bar/:timeframe', StackedBarController.getStackedBarByTimeframe);



export default router;