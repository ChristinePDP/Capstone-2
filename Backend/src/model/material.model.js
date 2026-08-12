import { supabase } from '../config/supabase.js';
import { convertUnit } from '../utils/unitConversion.js';

const MaterialModel = {
  findAll: () => supabase.from('celebration_materials').select('*').order('name'),
  findById: (id) => supabase.from('celebration_materials').select('*').eq('id', id).single(),
  findByName: (name) => supabase.from('celebration_materials').select('stock_quantity, unit').eq('name', name).single(),
  create: (data) => supabase.from('celebration_materials').insert(data).select().single(),
  update: (id, data) => supabase.from('celebration_materials').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('celebration_materials').delete().eq('id', id),
  setStock: (id, stock_quantity) =>
    supabase.from('celebration_materials').update({ stock_quantity }).eq('id', id).select().single(),

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