import { IngredientModel } from '../model/ingredient.model.js';
import { InventoryLogModel } from '../model/inventoryLog.model.js'; 
import { AppError } from '../middleware/errorHandler.js';
import { MaterialModel } from '../model/material.model.js';
import { supabase } from '../config/supabase.js'; 
import { ProductionModel } from '../model/production.model.js';
import { RecipeModel } from '../model/recipe.model.js';
import { WasteModel } from '../model/waste.model.js';
import { ProductModel } from '../model/product.model.js';

const ProductService = {
  getProducts: async (filters) => {
    const { data, error } = await ProductModel.findAll(filters);
    if (error) throw error;
    return data;
  },
};

// RAW INGREDIENTS
const IngredientService = {
  getAll: async () => {
    const { data, error } = await IngredientModel.findAll();
    if (error) throw error;
    return data;
  },

  create: async (body) => {
    const { data, error } = await IngredientModel.create(body);
    if (error) throw error;
    return data;
  },

  update: async (id, body) => {
    const { data, error } = await IngredientModel.update(id, body);
    if (error || !data) throw new AppError('Ingredient not found', 404);
    return data;
  },

  restock: async (id, body) => {
    console.log('--- 2. PUMASOK SA SERVICE ---');
    
    const { data: current, error: findErr } = await IngredientModel.findById(id);
    if (findErr || !current) throw new AppError('Ingredient not found', 404);

    const newTotalStock = current.stock_quantity + Number(body.added_qty);
    console.log('BAGONG TOTAL STOCK:', newTotalStock);

    const { data, error } = await IngredientModel.update(id, {
      stock_quantity: newTotalStock,
      minimum_stock: Number(body.minimum_stock)
    });
    if (error || !data) throw new AppError('Failed to update ingredient', 500);

    console.log('--- 3. MAGSE-SAVE NA SA LOGS TABLE ---');
    const logPayload = {
      item_type: 'raw',
      item_name: current.name,
      transaction_type: 'IN',
      quantity: Number(body.added_qty),
      cost: Number(body.total_cost || 0),
      action: 'Restock'
    };
    console.log('DATA NA IPAPASA SA SUPABASE:', logPayload);

    await InventoryLogModel.logHistory(logPayload);

    return data;
  },

  delete: async (id) => {
    const { error } = await IngredientModel.delete(id);
    if (error) throw error;
  },
};


const MaterialService = {
  getAll: async () => {
    const { data, error } = await MaterialModel.findAll();
    if (error) throw error;
    return data;
  },

  create: async (body) => {
    const { data, error } = await MaterialModel.create(body);
    if (error) throw error;
    return data;
  },

  update: async (id, body) => {
    const { data, error } = await MaterialModel.update(id, body);
    if (error) throw new AppError(`Failed to update material: ${error.message}`, 500);
    return data;
  },

  restock: async (id, body) => {
    // 1. Harangin kapag sobrang laki ng numbers (Overflow Guard)
    const addedQty = Number(body.added_qty);
    const totalCost = Number(body.total_cost || 0);

    if (addedQty > 1000000 || totalCost > 1000000) {
      throw new AppError('Masyadong malaki ang numero na inilagay. Pakibabaan ang quantity o cost.', 400);
    }

    // 2. Hanapin ang current material
    const { data: current, error: findErr } = await MaterialModel.findById(id);
    if (findErr || !current) throw new AppError('Material not found', 404);

    // 3. Compute ang bagong stock
    const newTotalStock = Number(current.stock_quantity || 0) + addedQty;

    // 4. I-update sa database
    const { data, error } = await MaterialModel.update(id, {
      stock_quantity: newTotalStock,
      minimum_stock: Number(body.minimum_stock)
    });

    if (error) {
      console.error("SUPABASE UPDATE ERROR:", error);
      throw new AppError(`Failed to update material: ${error.message}`, 500);
    }

    // 5. I-save sa logs nang LIGTAS (Hindi magka-crash kahit undefined ang return)
    try {
      const logPayload = {
        item_type: 'material',
        item_name: current.name,
        transaction_type: 'IN',
        quantity: addedQty,
        cost: totalCost,
        action: 'Restock'
      };

      const logResult = await InventoryLogModel.logHistory(logPayload);
      
      // Fallback check kung sakaling object nga ang ibinato at may error
      if (logResult && logResult.error) {
        console.error("SUPABASE LOG ERROR:", logResult.error);
        throw new AppError(`Failed to save log: ${logResult.error.message}`, 500);
      }
    } catch (logErr) {
      // Kung mag-throw man ang logHistory function mo internally, hindi mada-damage ang restock natin
      console.error("LIGTAS NA NASALO ANG LOGGING ERROR:", logErr);
    }

    return data;
  },

  delete: async (id) => {
    const { error } = await MaterialModel.delete(id);
    if (error) throw error;
  },
};

// PRODUCTION
const ProductionService = {
  getAll: async (limit) => {
    const { data, error } = await ProductionModel.findAll(limit);
    if (error) throw error;
    return data;
  },

  confirmBatch: async (body) => {
    const { data: recipe, error: recipeErr } = await RecipeModel.findWithIngredients(body.recipe_id);
    if (recipeErr || !recipe) throw new AppError('Recipe not found', 404);

    // 1. I-compute ang mga ibabawas
    const deductions = recipe.recipe_ingredients.map(ri => ({
      item_type: ri.item_type,
      item_name: ri.item_name,
      quantity:  +(ri.quantity * body.batches).toFixed(4),
      unit:      ri.unit,
    }));

    // 2. I-save ang production log
    const { data: log, error: logErr } = await ProductionModel.create(body);
    if (logErr) throw logErr;

    // 3. I-save ang listahan ng deductions
    const { error: deductErr } = await ProductionModel.insertDeductions(log.id, deductions);
    if (deductErr) throw deductErr;

    // 4. Bawasan ang actual stock sa database at MAG-LOG SA HISTORY
    for (const d of deductions) {
      if (d.item_type === 'raw') {
        await IngredientModel.deductByName(d.item_name, d.quantity);
      } else {
        await MaterialModel.deductByName(d.item_name, d.quantity);
      }

      await InventoryLogModel.logHistory({
        item_type: d.item_type,          
        item_name: d.item_name,
        transaction_type: 'OUT',         
        quantity: d.quantity,
        cost: 0,                         
        action: 'Production'             
      });
    }

    console.log('DEBUG supabase.from:', supabase.from.toString().slice(0, 100));
    console.log('DEBUG is mocked:', typeof supabase.from.mock !== 'undefined');
    
    // 5. 👉 IDAGDAG ANG STOCK SA PRODUCTS TABLE PARA SA POS ("Buy Now")
    const { data: prodData } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', body.product_id)
      .single();

    if (prodData) {
      const newProductStock = (prodData.stock_quantity || 0) + Number(body.total_produced);
      await supabase
        .from('products')
        .update({ stock_quantity: newProductStock })
        .eq('id', body.product_id);
    }

    return log;
  },

  // Ito ang function para malaman ang kailangang stock para sa future orders
  getRequirementsForOrders: async (startDate, endDate) => {
    // 1. Kunin lahat ng 'Confirmed' pre-orders sa date range
    const { data: orders } = await supabase
      .from('orders')
      .select('id, pickup_date, order_items(*)')
      .eq('order_type', 'Pre-Order')
      .eq('status', 'Confirmed')
      .gte('pickup_date', startDate)
      .lte('pickup_date', endDate);

    const requirements = {};

    // 2. I-compute ang total ingredients base sa recipes
    for (const order of orders) {
      for (const item of order.order_items) {
        const { data: recipe } = await RecipeModel.findWithIngredientsByProductId(item.product_id);
        if (!recipe) continue;

        for (const ri of recipe.recipe_ingredients) {
          const totalQty = ri.quantity * item.quantity;
          if (!requirements[ri.item_name]) {
            requirements[ri.item_name] = { name: ri.item_name, total: 0, unit: ri.unit };
          }
          requirements[ri.item_name].total += totalQty;
        }
      }
    }
    return requirements;
  },

};

// RECIPES
const RecipeService = {
  getAll: async () => {
    const { data, error } = await RecipeModel.findAll();
    if (error) throw error;
    return data;
  },

  getById: async (id) => {
    const { data, error } = await RecipeModel.findById(id);
    if (error || !data) throw new AppError('Recipe not found', 404);
    return data;
  },

  create: async (body) => {
    const { ingredients, ...recipeData } = body;
    const { data: recipe, error } = await RecipeModel.create(recipeData);
    if (error) throw error;

    const { error: ingErr } = await RecipeModel.insertIngredients(recipe.id, ingredients);
    if (ingErr) throw ingErr;

    return recipe;
  },

  update: async (id, body) => {
    const { ingredients, ...recipeData } = body;
    const { data, error } = await RecipeModel.update(id, recipeData);
    if (error || !data) throw new AppError('Recipe not found', 404);

    if (ingredients !== undefined) {
      await RecipeModel.deleteIngredients(id);
      if (ingredients.length) {
        const { error: ingErr } = await RecipeModel.insertIngredients(id, ingredients);
        if (ingErr) throw ingErr;
      }
    }
    return data;
  },

  delete: async (id) => {
    const { error } = await RecipeModel.delete(id);
    if (error) throw error;
  },
};

// ─── WASTE ───────────────────────────────────────────────────────────────────
const WasteService = {
  getAll: async (limit) => {
    const { data, error } = await WasteModel.findAll(limit);
    if (error) throw error;
    return data;
  },

  log: async (body) => {
    // 1. Logic for deducting stocks
    if (body.waste_type === 'ingredient') {
      await IngredientModel.deductByName(body.item_name, body.quantity);
    } else if (body.waste_type === 'material') {
      await MaterialModel.deductByName(body.item_name, body.quantity);
    }

    // 2. Correct way to call Supabase via WasteModel
    const response = await WasteModel.create(body);
    if (response.error) throw response.error;

    // 3. I-SAVE SA INVENTORY LOGS (Para sa 'OUT' analytics)
    if (body.waste_type === 'ingredient' || body.waste_type === 'material') {
      await InventoryLogModel.logHistory({
        item_type: body.waste_type === 'ingredient' ? 'raw' : 'material',
        item_name: body.item_name,
        transaction_type: 'OUT',
        quantity: Number(body.quantity),
        cost: Number(body.cost || 0),
        action: 'Waste'
      });
    }

    return response.data;
  },
};

export { ProductService, WasteService, RecipeService, ProductionService, MaterialService, IngredientService };