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

    // AUDIT LOG: ang raw_ingredients table ay walang `created_at` at
    // ang `updated_at` nito ay nababago paulit-ulit (kada restock/edit),
    // kaya walang paraan ang Analytics na makuha ang gastos ng UNANG
    // pagkakagawa ng isang ingredient mula rito. Ito lang ang paraan
    // para ma-preserve ang historical na "kailan at magkano" — hindi
    // ito pagbabago sa logic ng stock_quantity/cost_per_unit, dagdag
    // lang na audit entry sa inventory_logs, kagaya ng ginagawa na sa
    // restock(). Ginamit ang `data.*` (galing mismo sa DB pagkatapos
    // ng insert) sa halip na `body.*`, dahil confirmed real columns
    // ang stock_quantity at cost_per_unit sa schema.
    const initialQty = Number(data.stock_quantity || 0);
    const initialCost = parseFloat((Number(data.cost_per_unit || 0) * initialQty).toFixed(2));

    if (initialQty > 0) {
      await InventoryLogModel.logHistory({
        item_type: 'raw',
        item_name: data.name,
        transaction_type: 'IN',
        quantity: initialQty,
        cost: initialCost,
        action: 'Initial Stock',
        remaining_quantity: initialQty,
        expiration_date: body.expiration_date || null,
      });
    }

    return data;
  },

  update: async (id, body) => {
    const { data, error } = await IngredientModel.update(id, body);
    if (error || !data) throw new AppError('Ingredient not found', 404);
    return data;
  },

  restock: async (id, body) => {
    console.log('--- 2. PUMASOK SA SERVICE ---');

    // Overflow / typo guard (tugma sa ginagawa na ng MaterialService) —
    // hinaharangan dito ang mga sablay na numero bago pa maka-apekto
    // sa totoong stock sa database.
    const addedQty = Number(body.added_qty);
    const totalCost = Number(body.total_cost || 0);

    if (!Number.isFinite(addedQty) || addedQty <= 0) {
      throw new AppError('Invalid ang dami na inilagay. Dapat positibong number.', 400);
    }
    if (addedQty > 1000000 || totalCost > 1000000) {
      throw new AppError('Masyadong malaki ang numero na inilagay. Pakibabaan ang quantity o cost.', 400);
    }

    const { data: current, error: findErr } = await IngredientModel.findById(id);
    if (findErr || !current) throw new AppError('Ingredient not found', 404);

    const newTotalStock = current.stock_quantity + addedQty;
    console.log('BAGONG TOTAL STOCK:', newTotalStock);

    // IMPORTANT: hindi na dapat "i-update" ang minimum_stock dito sa
    // Restock — tinanggal na ito sa Restock modal ng frontend (dapat
    // sa "Ayusin ang Detalye" na lang babaguhin ang minimum_stock).
    // Kung basta natin "Number(body.minimum_stock)" gagawin nang hindi
    // sinusuri, at wala namang ipinasa ang frontend, magiging NaN ito
    // at masisira ang existing value sa database. Kaya isasama lang
    // natin sa update object kung talagang may ipinasang value.
    const updatePayload = { stock_quantity: newTotalStock };
    if (body.minimum_stock !== undefined && body.minimum_stock !== null && body.minimum_stock !== '') {
      const parsedMin = Number(body.minimum_stock);
      if (Number.isFinite(parsedMin)) updatePayload.minimum_stock = parsedMin;
    }

    const { data, error } = await IngredientModel.update(id, updatePayload);
    if (error || !data) throw new AppError('Failed to update ingredient', 500);

    console.log('--- 3. MAGSE-SAVE NA SA LOGS TABLE ---');
    const logPayload = {
      item_type: 'raw',
      item_name: current.name,
      transaction_type: 'IN',
      quantity: addedQty,
      cost: totalCost,
      action: 'Restock',
      remaining_quantity: addedQty, 
      expiration_date: body.expiration_date || null
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

    // AUDIT LOG: kaparehong dahilan ng IngredientService.create() —
    // walang created_at ang celebration_materials, kaya dito lang
    // (inventory_logs) mare-record ang gastos sa unang pagkakagawa.
    const initialQty = Number(data.stock_quantity || 0);
    const initialCost = parseFloat((Number(data.cost_per_unit || 0) * initialQty).toFixed(2));

    if (initialQty > 0) {
      await InventoryLogModel.logHistory({
        item_type: 'material',
        item_name: data.name,
        transaction_type: 'IN',
        quantity: initialQty,
        cost: initialCost,
        action: 'Initial Stock',
        remaining_quantity: initialQty,
        expiration_date: body.expiration_date || null,
      });
    }

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

    if (!Number.isFinite(addedQty) || addedQty <= 0) {
      throw new AppError('Invalid ang dami na inilagay. Dapat positibong number.', 400);
    }
    if (addedQty > 1000000 || totalCost > 1000000) {
      throw new AppError('Masyadong malaki ang numero na inilagay. Pakibabaan ang quantity o cost.', 400);
    }

    // 2. Hanapin ang current material
    const { data: current, error: findErr } = await MaterialModel.findById(id);
    if (findErr || !current) throw new AppError('Material not found', 404);

    // 3. Compute ang bagong stock
    const newTotalStock = Number(current.stock_quantity || 0) + addedQty;

    // 4. I-update sa database — hindi na dapat i-overwrite ang
    // minimum_stock dito (tinanggal na sa Restock modal ng frontend;
    // sa "Ayusin ang Detalye" na lang dapat babaguhin ito). Isasama
    // lang ito sa update kung talagang may ipinasang value.
    const updatePayload = { stock_quantity: newTotalStock };
    if (body.minimum_stock !== undefined && body.minimum_stock !== null && body.minimum_stock !== '') {
      const parsedMin = Number(body.minimum_stock);
      if (Number.isFinite(parsedMin)) updatePayload.minimum_stock = parsedMin;
    }

    const { data, error } = await MaterialModel.update(id, updatePayload);

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
        action: 'Restock',
        remaining_quantity: addedQty, 
        expiration_date: body.expiration_date || null
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

// INVENTORY HISTORY (restock / production / waste trail)
const InventoryLogService = {
  getHistory: async (filters) => {
    return InventoryLogModel.getHistory(filters);
  },

  // ── VOID RESTOCK (kanselahin nang may audit trail) ──────────────
  // Kanselahin ang isang MALING restock entry — ibinabalik (ibinabawas)
  // ang dami na dati'y naidagdag, at naka-mark na lang bilang voided
  // ang log (hindi totoong "delete", audit trail pa rin).
  voidRestock: async (logId, force = false) => {
    const log = await InventoryLogModel.findById(logId);
    if (!log) throw new AppError('Restock log not found', 404);
    if (log.voided_at) throw new AppError('Naka-void na ang restock entry na ito.', 400);
    if (log.action !== 'Restock' || log.transaction_type !== 'IN') {
      throw new AppError('Hindi ito isang restock entry — hindi ito puwedeng i-void dito.', 400);
    }

    // Piliin ang tamang model base sa item_type ('raw' o 'material')
    const Model = log.item_type === 'raw' ? IngredientModel : MaterialModel;

    const result = await Model.reverseRestock(log.item_name, log.quantity, force);

    if (result.notFound) {
      throw new AppError(`"${log.item_name}" ay hindi na mahanap sa kasalukuyang inventory (baka na-delete na).`, 404);
    }

    // IMPORTANT: kung hindi sapat ang kasalukuyang stock para ma-reverse
    // nang buo, itigil muna dito — huwag basta i-clamp nang tahimik.
    // Ibabalik ang detalye papunta sa frontend para maipakita sa user
    // (via ConfirmModal) bago sila pumayag na ituloy (force = true).
    if (result.insufficient) {
      throw new AppError(
        `Hindi ma-void nang buo: ${log.quantity} ${'unit' in log ? log.unit : ''} ang dapat i-reverse, `
        + `pero ${result.currentStock} na lang ang kasalukuyang stock ng "${log.item_name}" `
        + `(baka nagamit na ito sa production o waste). Kumpirmahin kung gusto mo pa ring ituloy — `
        + `mapupunta sa 0 ang stock nito.`,
        409
      );
    }

    // Markahan ang orihinal na log bilang voided
    await InventoryLogModel.markVoided(logId);

    // Bagong "OUT" entry bilang paliwanag/ebidensya ng pagtatama —
    // walang butas sa audit trail kahit magkamali sa restock.
    await InventoryLogModel.logHistory({
      item_type: log.item_type,
      item_name: log.item_name,
      transaction_type: 'OUT',
      quantity: log.quantity,
      cost: 0,
      action: 'Void Restock (Pagtatama)',
    });

    return { voided: true, newStock: result.newStock };
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
      try {
        if (d.item_type === 'raw') {
          // Ipinapasa ang d.unit (unit na naka-declare sa recipe) — kung
          // magkaiba ito sa aktwal na unit ng stock sa database (hal.
          // recipe = "g" pero stock = "kg"), awtomatiko itong iko-convert
          // sa loob ng deductByName bago ibawas. Kung hindi ma-convert
          // (di-magkatugmang klase ng unit), mag-e-error ito.
          await IngredientModel.deductByName(d.item_name, d.quantity, d.unit);
        } else {
          await MaterialModel.deductByName(d.item_name, d.quantity, d.unit);
        }
      } catch (deductErr) {
        // Itigil agad ang batch confirmation kung hindi ligtas i-deduct
        // ang isang ingredient — mas mabuting malaman agad ng user kaysa
        // tahimik na magkamali ang stock count.
        throw new AppError(
          `Hindi na-tuloy ang batch: ${deductErr.message}`,
          400
        );
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
    // 1. Logic for deducting stocks — ipinapasa rin ang body.unit para
    // pareho ring protektado ito (tingnan ang paliwanag sa
    // ProductionService.confirmBatch tungkol sa unit-aware deduction).
    //
    // IMPORTANT BUG FIX: dati, WALANG nangyayari kapag ang
    // body.waste_type === 'product' — hindi na-deduct ang product
    // stock (hal. "Finished Production") kapag nag-log ng
    // unsold/damaged na produkto. Idinagdag na ngayon ang branch para
    // dito.
    try {
      if (body.waste_type === 'ingredient') {
        await IngredientModel.deductByName(body.item_name, body.quantity, body.unit);
      } else if (body.waste_type === 'material') {
        await MaterialModel.deductByName(body.item_name, body.quantity, body.unit);
      } else if (body.waste_type === 'product') {
        await ProductModel.deductByName(body.item_name, body.quantity);
      }
    } catch (deductErr) {
      throw new AppError(`Hindi na-log ang waste: ${deductErr.message}`, 400);
    }

    // 2. Correct way to call Supabase via WasteModel
    const response = await WasteModel.create(body);
    if (response.error) throw response.error;

    // 3. I-SAVE SA INVENTORY LOGS (Para sa 'OUT' analytics)
    //
    // IMPORTANT: ang inventory_logs.item_type column ay isang Postgres
    // ENUM (inv_item_type) na 'raw' at 'material' LANG ang pinapayagan
    // — WALA itong 'product' na value. Kaya HINDI natin dapat isama
    // ang waste_type === 'product' dito (mage-error ang insert kung
    // gagawin natin, "invalid input value for enum inv_item_type").
    // Hindi naman kailangan dito ang product waste — nakatala na ito
    // nang buo sa waste_logs table mismo (item_name, quantity, cost,
    // atbp.), at ang product stock naman ay direktang na-deduct na sa
    // products table via ProductModel.deductByName sa itaas.
    if (['ingredient', 'material'].includes(body.waste_type)) {
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

  // ── VOID (kanselahin nang may audit trail) ──────────────────────
  // Hindi ito totoong "delete" — nananatili ang record sa database
  // (naka-mark na lang bilang voided, tinatago sa normal na listahan),
  // AT ibinabalik ang stock na naibawas dati dahil sa maling log.
  // Bukod pa dito, may bagong "IN" entry na nalilikha sa inventory_logs
  // bilang paliwanag/ebidensya ng pag-correct — walang butas sa
  // pagsubaybay kahit magkamali.
  void: async (id) => {
    const { data: log, error: findErr } = await WasteModel.findById(id);
    if (findErr || !log) throw new AppError('Waste record not found', 404);
    if (log.voided_at) throw new AppError('Naka-void na ang record na ito.', 400);

    try {
      if (log.waste_type === 'ingredient') {
        await IngredientModel.restoreByName(log.item_name, log.quantity, log.unit);
      } else if (log.waste_type === 'material') {
        await MaterialModel.restoreByName(log.item_name, log.quantity, log.unit);
      } else if (log.waste_type === 'product') {
        await ProductModel.restoreByName(log.item_name, log.quantity);
      }
    } catch (err) {
      throw new AppError(`Hindi ma-void: ${err.message}`, 400);
    }

    const { data: updated, error: voidErr } = await WasteModel.markVoided(id);
    if (voidErr) throw new AppError('Failed to mark waste log as voided', 500);
    if (['ingredient', 'material'].includes(log.waste_type)) {
      await InventoryLogModel.logHistory({
        item_type: log.waste_type === 'ingredient' ? 'raw' : 'material',
        item_name: log.item_name,
        transaction_type: 'IN',
        quantity: Number(log.quantity),
        cost: 0,
        action: 'Void Waste (Pagtatama)'
      });
    }

    return updated;
  },
};

export { ProductService, WasteService, RecipeService, ProductionService, MaterialService, IngredientService, InventoryLogService };