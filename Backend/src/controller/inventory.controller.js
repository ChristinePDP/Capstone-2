import { ok, created } from '../utils/response.js';
import { IngredientCreateSchema, UpdateStockItemSchema, RestockSchema, CreateRecipeSchema, UpdateRecipeSchema, ConfirmBatchSchema, WasteLogSchema, MaterialCreateSchema } from '../schemas/index.js';
import { MaterialService, ProductService, ProductionService, RecipeService, WasteService, IngredientService, InventoryLogService } from '../services/inventory.service.js';
import { emitRealtimeChange } from '../services/realtime.service.js';

const IngredientController = {
  getAll: async (_req, res, next) => {
    try { ok(res, await IngredientService.getAll()); }
    catch (err) { next(err); }
  },
  create: async (req, res, next) => {
    try {
      const body = IngredientCreateSchema.parse(req.body);
      const result = await IngredientService.create(body);
      emitRealtimeChange({ table: 'raw_ingredients', event: 'INSERT', recordId: result?.id });
      created(res, result, 'Ingredient added');
    } catch (err) { next(err); }
  },
  update: async (req, res, next) => {
    try {
      const body = UpdateStockItemSchema.parse(req.body);
      const result = await IngredientService.update(req.params.id, body);
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE', recordId: req.params.id });
      ok(res, result, 'Ingredient updated');
    } catch (err) { next(err); }
  },
restock: async (req, res, next) => {
    try {
      console.log('--- 1. PUMASOK SA CONTROLLER ---');
      console.log('ID:', req.params.id);
      console.log('BODY GALING FRONTEND:', req.body);
      
      const result = await IngredientService.restock(req.params.id, req.body);
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE', recordId: req.params.id });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
      ok(res, result, 'Restocked');
    } catch (err) { 
      console.error('--- ERROR SA CONTROLLER ---', err.message);
      next(err); 
    }
  },
  delete: async (req, res, next) => {
    try {
      await IngredientService.delete(req.params.id);
      emitRealtimeChange({ table: 'raw_ingredients', event: 'DELETE', recordId: req.params.id });
      ok(res, null, 'Ingredient deleted');
    } catch (err) { next(err); }
  },
};


const MaterialController = {
  getAll: async (_req, res, next) => {
    try { ok(res, await MaterialService.getAll()); }
    catch (err) { next(err); }
  },
  create: async (req, res, next) => {
    try {
      // This schema requires material_type ('celebration' | 'product')
      const body = MaterialCreateSchema.parse(req.body);
      const result = await MaterialService.create(body);
      emitRealtimeChange({ table: 'celebration_materials', event: 'INSERT', recordId: result?.id });
      created(res, result, 'Material added');
    } catch (err) { next(err); }
  },
  update: async (req, res, next) => {
    try {
      const body = UpdateStockItemSchema.parse(req.body);
      const result = await MaterialService.update(req.params.id, body);
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE', recordId: req.params.id });
      ok(res, result, 'Material updated');
    } catch (err) { next(err); }
  },
  restock: async (req, res, next) => {
    try {
      // const { qty } = RestockSchema.parse(req.body);
      const result = await MaterialService.restock(req.params.id, req.body);
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE', recordId: req.params.id });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
      ok(res, result, 'Restocked');
    } catch (err) { next(err); }
  },
  delete: async (req, res, next) => {
    try {
      await MaterialService.delete(req.params.id);
      emitRealtimeChange({ table: 'celebration_materials', event: 'DELETE', recordId: req.params.id });
      ok(res, null, 'Material deleted');
    } catch (err) { next(err); }
  },
};

const ProductController = {
  getAll: async (req, res, next) => {
    try {
      const filters = {
        category: req.query.category,
        search: req.query.search,
        activeOnly: req.query.activeOnly !== 'false',
      };

      ok(res, await ProductService.getProducts(filters));
    } catch (err) {
      next(err);
    }
  },
};

const ProductionController = {
  getAll: async (req, res, next) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit) || 50);
      ok(res, await ProductionService.getAll(limit));
    } catch (err) { next(err); }
  },
  confirmBatch: async (req, res, next) => {
    try {
      // Pre-Order production (may extra expenses) — iisang POST /production
      // ang ginagamit; ang `type: 'pre-order'` ang nagtatakda kung alin.
      if (req.body?.type === 'pre-order') {
        const { type: _type, ...payload } = req.body;
        const result = await ProductionService.producePreOrder(payload);
        emitRealtimeChange({ table: 'production_logs', event: 'INSERT', recordId: result?.id });
        emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
        emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE' });
        emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
        return created(res, result, 'Pre-order production logged');
      }
      const body = ConfirmBatchSchema.parse(req.body);
      const result = await ProductionService.confirmBatch(body);
      emitRealtimeChange({ table: 'production_logs', event: 'INSERT', recordId: result?.id });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE' });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
      created(res, result, 'Production batch logged');
    } catch (err) { next(err); }
  },

  getShoppingList: async (req, res, next) => {
    try {
      // Kunin ang data para sa susunod na 7 araw (halimbawa lang)
      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      ok(res, await ProductionService.getRequirementsForOrders(startDate, endDate));
    } catch (err) { next(err); }
  },
};


const RecipeController = {
  getAll: async (_req, res, next) => {
    try { ok(res, await RecipeService.getAll()); }
    catch (err) { next(err); }
  },
  getById: async (req, res, next) => {
    try { ok(res, await RecipeService.getById(req.params.id)); }
    catch (err) { next(err); }
  },
  create: async (req, res, next) => {
    try {
      const body = CreateRecipeSchema.parse(req.body);
      const result = await RecipeService.create(body);
      emitRealtimeChange({ table: 'recipes', event: 'INSERT', recordId: result?.id });
      created(res, result, 'Recipe created');
    } catch (err) { next(err); }
  },
  update: async (req, res, next) => {
    try {
      const body = UpdateRecipeSchema.parse(req.body);
      const result = await RecipeService.update(req.params.id, body);
      emitRealtimeChange({ table: 'recipes', event: 'UPDATE', recordId: req.params.id });
      ok(res, result, 'Recipe updated');
    } catch (err) { next(err); }
  },
  delete: async (req, res, next) => {
    try {
      await RecipeService.delete(req.params.id);
      emitRealtimeChange({ table: 'recipes', event: 'DELETE', recordId: req.params.id });
      ok(res, null, 'Recipe deleted');
    } catch (err) { next(err); }
  },
};


// Para sa "View History" — walang butas na pagsubaybay ng bawat
// restock / production deduction / waste sa isang item.
const InventoryLogController = {
  getExpiringBatches: async (req, res, next) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
      ok(res, await InventoryLogService.getExpiringDashboardBatches(days));
    } catch (err) { next(err); }
  },
  getHistory: async (req, res, next) => {
    try {
      const { item_name, item_type, item_id, startDate, endDate, limit } = req.query;
      const defaultEnd = new Date().toISOString();
      const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const data = await InventoryLogService.getHistory({
        itemName: item_name,
        itemType: item_type,
        itemId: item_id,
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd,
        limit: limit ? Math.min(500, parseInt(limit, 10)) : 100,
      });

      ok(res, data);
    } catch (err) { next(err); }
  },

  // Kanselahin (void) ang isang MALING restock entry — tingnan ang
  // paliwanag sa InventoryLogService.voidRestock. Opsyonal ang
  // `?force=true` sa query string — ginagamit lang ito kapag na-warn na
  // ang user (409 insufficient) at pumayag pa rin silang ituloy.
  voidRestock: async (req, res, next) => {
    try {
      const force = req.query.force === 'true';
      const result = await InventoryLogService.voidRestock(req.params.id, force);
      emitRealtimeChange({ table: 'inventory_logs', event: 'UPDATE', recordId: req.params.id });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE' });
      ok(res, result, 'Restock entry voided');
    } catch (err) { next(err); }
  },
};

const WasteController = {
  getAll: async (req, res, next) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit) || 50);
      ok(res, await WasteService.getAll(limit));
    } catch (err) { next(err); }
  },
  log: async (req, res, next) => {
    try {
      const body = WasteLogSchema.parse(req.body);
      const result = await WasteService.log(body);
      emitRealtimeChange({ table: 'waste_logs', event: 'INSERT', recordId: result?.id });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE' });
      created(res, result, 'Waste logged');
    } catch (err) { next(err); }
  },
  // Kanselahin (void) ang isang waste record — ibinabalik ang stock na
  // naibawas dati, at nananatili sa database ang record bilang audit
  // trail (hindi totoong "delete").
  void: async (req, res, next) => {
    try {
      const result = await WasteService.void(req.params.id);
      emitRealtimeChange({ table: 'waste_logs', event: 'UPDATE', recordId: req.params.id });
      emitRealtimeChange({ table: 'inventory_logs', event: 'INSERT' });
      emitRealtimeChange({ table: 'raw_ingredients', event: 'UPDATE' });
      emitRealtimeChange({ table: 'celebration_materials', event: 'UPDATE' });
      ok(res, result, 'Waste record voided');
    } catch (err) { next(err); }
  },
};

export {
  IngredientController,
  MaterialController,
  ProductController,
  ProductionController,
  RecipeController,
  WasteController,
  InventoryLogController
};
