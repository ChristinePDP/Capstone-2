import { Router } from 'express';
import { 
  IngredientController, 
  MaterialController, 
  ProductController, 
  ProductionController, 
  RecipeController, 
  WasteController,
  InventoryLogController
} from '../controller/inventory.controller.js';

const router = Router();

// ── INGREDIENTS ─────────────────────────────────────
router.get('/ingredients', IngredientController.getAll); 
router.post('/ingredients', IngredientController.create); 
router.put('/ingredients/:id', IngredientController.update); 
router.patch('/ingredients/:id/restock', IngredientController.restock); 
router.delete('/ingredients/:id', IngredientController.delete); 

// ── MATERIALS ───────────────────────────────────────
router.get('/materials', MaterialController.getAll); 
router.post('/materials', MaterialController.create);
router.put('/materials/:id', MaterialController.update); 
router.patch('/materials/:id/restock', MaterialController.restock); 
router.delete('/materials/:id', MaterialController.delete); 

// ── PRODUCTS ────────────────────────────────────────
router.get('/products', ProductController.getAll); 

// ── PRODUCTION ──────────────────────────────────────
router.get('/production', ProductionController.getAll); 
router.post('/production', ProductionController.confirmBatch); 
router.get('/production/shopping-list', ProductionController.getShoppingList); 

// ── RECIPES ─────────────────────────────────────────
router.get('/recipes', RecipeController.getAll);
router.get('/recipes/:id', RecipeController.getById); 
router.post('/recipes', RecipeController.create);
router.put('/recipes/:id', RecipeController.update);
router.delete('/recipes/:id', RecipeController.delete); 

// ── WASTE ───────────────────────────────────────────
router.get('/waste', WasteController.getAll); 
router.post('/waste', WasteController.log); 

// ── INVENTORY HISTORY (restock / production / waste trail) ──
router.get('/logs', InventoryLogController.getHistory); 

// I-export bilang default
export default router;