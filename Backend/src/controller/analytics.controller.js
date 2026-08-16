import { ok } from '../utils/response.js';
import { 
  FourKpiService, 
  StackedBarServices, 
  TopProductsService 
} from '../services/analytics.service.js';

// ==========================================
// Controllers
// ==========================================

const FourKpiController = {
  getKpiByTimeframe: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      const result = await FourKpiService.getKpiByTimeframe(timeframe);

      ok(res, result, 'KPI data fetched successfully');
    } catch (err) {
      next(err); 
    }
  },
};

const StackedBarController = {
  getStackedBarByTimeframe: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      
      const result = await StackedBarServices.getStackedBarByTimeframe(timeframe);
      ok(res, result, 'Stacked Bar data fetched successfully');
    } catch (err) {
      next(err); 
    }
  },
};

const TopProductsController = {
  getTopProducts: async (req, res, next) => {
    try {
      const { timeframe } = req.params;
      const result = await TopProductsService.getTopProductsByTimeframe(timeframe);
      
      ok(res, result, 'Top products fetched successfully');
    } catch (err) {
      next(err);
    }
  },
};

export {
  FourKpiController,
  StackedBarController,
  TopProductsController
};