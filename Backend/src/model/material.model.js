import { supabase } from '../config/supabase.js';
import { convertUnit } from '../utils/unitConversion.js';

const MaterialModel = {
  findAll: () => supabase.from('celebration_materials').select('*').order('name'),
  findById: (id) => supabase.from('celebration_materials').select('*').eq('id', id).single(),
  findByProductId: (productId) => supabase.from('celebration_materials').select('*').eq('product_id', productId).maybeSingle(),
  findByName: (name) => supabase.from('celebration_materials').select('stock_quantity, unit').eq('name', name).single(),
  create: (data) => supabase.from('celebration_materials').insert(data).select().single(),
  update: (id, data) => supabase.from('celebration_materials').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('celebration_materials').delete().eq('id', id),
  setStock: (id, stock_quantity) =>
    supabase.from('celebration_materials').update({ stock_quantity }).eq('id', id).select().single(),

  deductById: async (id, qty, fromUnit) => {
    const { data: item, error } = await supabase.from('celebration_materials')
      .select('id, name, stock_quantity, unit').eq('id', id).single();
    if (error) throw error;
    if (!item) throw new Error('Product material not found.');
    const deductQty = fromUnit && fromUnit !== item.unit ? convertUnit(qty, fromUnit, item.unit) : Number(qty);
    if (!Number.isFinite(deductQty)) throw new Error(`Hindi compatible ang unit na ${fromUnit} sa ${item.unit} para sa ${item.name}.`);

    const { data: batches, error: fetchErr } = await supabase.from('inventory_logs')
      .select('id, remaining_quantity, remaining_unit')
      .eq('material_id', id).eq('transaction_type', 'IN')
      .is('voided_at', null).gt('remaining_quantity', 0)
      .order('expiration_date', { ascending: true, nullsFirst: false });
    if (fetchErr) throw fetchErr;

    let remainingToDeduct = deductQty;
    for (const batch of batches || []) {
      if (remainingToDeduct <= 0) break;
      const batchUnit = batch.remaining_unit || item.unit;
      const available = convertUnit(batch.remaining_quantity, batchUnit, item.unit);
      if (!Number.isFinite(available)) throw new Error(`Hindi ma-convert ang natitirang batch ng ${item.name} mula ${batchUnit} papuntang ${item.unit}.`);
      const take = Math.min(available, remainingToDeduct);
      const takeInBatchUnit = convertUnit(take, item.unit, batchUnit);
      const { error: lotErr } = await supabase.from('inventory_logs')
        .update({ remaining_quantity: Math.max(0, Number(batch.remaining_quantity) - takeInBatchUnit) })
        .eq('id', batch.id);
      if (lotErr) throw lotErr;
      remainingToDeduct -= take;
    }

    const { error: stockErr } = await supabase.from('celebration_materials')
      .update({ stock_quantity: Math.max(0, Number(item.stock_quantity) - deductQty) }).eq('id', id);
    if (stockErr) throw stockErr;
    return { item, deducted: deductQty };
  },

  restoreById: async (id, qty, fromUnit) => {
    const { data: item, error } = await supabase.from('celebration_materials')
      .select('stock_quantity, unit').eq('id', id).single();
    if (error) throw error;
    const restoreQty = fromUnit && fromUnit !== item.unit ? convertUnit(qty, fromUnit, item.unit) : Number(qty);
    if (!Number.isFinite(restoreQty)) throw new Error(`Hindi compatible ang unit na ${fromUnit} sa ${item.unit}.`);
    const { error: updateErr } = await supabase.from('celebration_materials').update({ stock_quantity: Number(item.stock_quantity) + restoreQty }).eq('id', id);
    if (updateErr) throw updateErr;
    return { item, restoredQuantity: restoreQty };
  },

  reverseRestockById: async (id, qty, fromUnit, force = false) => {
    const { data: item, error } = await supabase.from('celebration_materials')
      .select('stock_quantity, unit').eq('id', id).single();
    if (error || !item) return { notFound: true };
    const reverseQty = fromUnit && fromUnit !== item.unit ? convertUnit(qty, fromUnit, item.unit) : Number(qty);
    if (!Number.isFinite(reverseQty)) throw new Error(`Hindi compatible ang unit na ${fromUnit} sa ${item.unit}.`);
    const currentStock = Number(item.stock_quantity || 0);
    if (currentStock < reverseQty && !force) return { insufficient: true, currentStock, requested: reverseQty };
    const newStock = Math.max(0, currentStock - reverseQty);
    const { error: updateErr } = await supabase.from('celebration_materials').update({ stock_quantity: newStock }).eq('id', id);
    if (updateErr) throw updateErr;
    return { updated: true, newStock };
  },

  deductByName: async (name, qty, fromUnit) => {
    const { data } = await supabase.from('celebration_materials').select('stock_quantity, unit').eq('name', name).single();
    if (!data) return;

    let deductQty = Number(qty);

    if (fromUnit && data.unit && fromUnit !== data.unit) {
      const converted = convertUnit(qty, fromUnit, data.unit);
      if (!Number.isFinite(converted)) {
        throw new Error(
          `Hindi ma-convert ang "${qty} ${fromUnit}" papuntang "${data.unit}" para sa "${name}". ` +
          `Hindi magkatugma ang units — pakisuri ang unit na nakalagay sa recipe/waste log kumpara sa ` +
          `aktwal na unit ng item sa Inventory.`
        );
      }
      deductQty = converted;
    }

    // --- BAGONG FEFO LOGIC START ---
    const { data: batches, error: fetchErr } = await supabase
      .from('inventory_logs')
      .select('id, remaining_quantity')
      .eq('item_name', name)
      .eq('transaction_type', 'IN')
      .gt('remaining_quantity', 0)
      .order('expiration_date', { ascending: true, nullsFirst: false });

    if (!fetchErr && batches) {
      let remainingToDeduct = deductQty;
      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;
        const availableInBatch = Number(batch.remaining_quantity);
        const deductFromThisBatch = Math.min(availableInBatch, remainingToDeduct);
        remainingToDeduct -= deductFromThisBatch;

        await supabase
          .from('inventory_logs')
          .update({ remaining_quantity: availableInBatch - deductFromThisBatch })
          .eq('id', batch.id);
      }
    }
    // --- BAGONG FEFO LOGIC END ---

    return supabase.from('celebration_materials')
      .update({ stock_quantity: Math.max(0, data.stock_quantity - deductQty) })
      .eq('name', name);
  },

  restoreByName: async (name, qty, fromUnit) => {
    const { data } = await supabase.from('celebration_materials').select('stock_quantity, unit').eq('name', name).single();
    if (!data) return;

    let restoreQty = Number(qty);
    if (fromUnit && data.unit && fromUnit !== data.unit) {
      const converted = convertUnit(qty, fromUnit, data.unit);
      if (Number.isFinite(converted)) restoreQty = converted;
    }

    return supabase.from('celebration_materials')
      .update({ stock_quantity: data.stock_quantity + restoreQty })
      .eq('name', name);
  },

  reverseRestock: async (name, qty, force = false) => {
    const { data } = await supabase
      .from('celebration_materials')
      .select('stock_quantity, unit')
      .eq('name', name)
      .single();

    if (!data) return { notFound: true };

    const reverseQty = Number(qty);
    const currentStock = Number(data.stock_quantity ?? 0);

    if (currentStock < reverseQty && !force) {
      return { insufficient: true, currentStock, requested: reverseQty };
    }

    const newStock = Math.max(0, currentStock - reverseQty);
    const { error } = await supabase
      .from('celebration_materials')
      .update({ stock_quantity: newStock })
      .eq('name', name);

    if (error) throw error;
    return { updated: true, newStock };
  },
};

export { MaterialModel };
