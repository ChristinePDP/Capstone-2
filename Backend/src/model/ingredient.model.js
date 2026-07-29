import { supabase } from '../config/supabase.js';
import { convertUnit } from '../utils/unitConversion.js';

const IngredientModel = {
  findAll: () => supabase.from('raw_ingredients').select('*').order('name'),
  findById: (id) => supabase.from('raw_ingredients').select('*').eq('id', id).single(),
  findByName: (name) => supabase.from('raw_ingredients').select('stock_quantity, unit').eq('name', name).single(),
  create: (data) => supabase.from('raw_ingredients').insert(data).select().single(),
  update: (id, data) => supabase.from('raw_ingredients').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('raw_ingredients').delete().eq('id', id),
  setStock: (id, stock_quantity) =>
    supabase.from('raw_ingredients').update({ stock_quantity }).eq('id', id).select().single(),

  /**
   * Ibawas ang `qty` (na naka-express sa `fromUnit`) mula sa stock ng
   * ingredient na may pangalang `name`. Kung magkaiba ang `fromUnit`
   * (hal. galing sa recipe, "g") sa aktwal na unit ng stock sa
   * database (hal. "kg"), awtomatiko itong iko-convert bago ibawas —
   * PARA HINDI MASIRA ANG STOCK dahil lang sa hindi tugmang unit.
   *
   * Kung hindi ma-convert (hal. "boxes" -> "kg", walang universal na
   * factor), IBABATO NITO ANG ERROR sa halip na basta magbawas ng
   * maling numero — mas mabuting tumigil at ipa-alam sa user, kaysa
   * tahimik na sirain ang totoong stock count.
   */
  deductByName: async (name, qty, fromUnit) => {
    const { data } = await supabase.from('raw_ingredients').select('stock_quantity, unit').eq('name', name).single();
    if (!data) return;

    let deductQty = Number(qty);

    // I-convert lang kung binigay ang fromUnit AT magkaiba ito sa
    // aktwal na unit ng item sa database.
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

    return supabase.from('raw_ingredients')
      .update({ stock_quantity: Math.max(0, data.stock_quantity - deductQty) })
      .eq('name', name);
  },
};

export { IngredientModel };