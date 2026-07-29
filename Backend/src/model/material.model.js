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

  // Tingnan ang paliwanag sa IngredientModel.deductByName — parehong
  // proteksyon dito: i-convert kung kailangan, mag-error kung hindi
  // ma-convert, para hindi masira ang stock count.
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

    return supabase.from('celebration_materials')
      .update({ stock_quantity: Math.max(0, data.stock_quantity - deductQty) })
      .eq('name', name);
  },
};

export { MaterialModel };