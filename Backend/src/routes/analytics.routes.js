import { Router } from 'express';

import {
  FourKpiController,
  StackedBarController,
} from '../controller/analytics.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authMiddlewareJwt);

// Four KPI
router.get('/four-kpi/:timeframe', FourKpiController.getKpiByTimeframe);

// Stacked Bar
router.get('/stacked-bar/:timeframe', StackedBarController.getStackedBarByTimeframe);



export default router;