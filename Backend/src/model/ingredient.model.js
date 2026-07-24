import { supabase } from '../config/supabase.js';


const IngredientModel = {
  findAll: () => supabase.from('raw_ingredients').select('*').order('name'),
  findById: (id) => supabase.from('raw_ingredients').select('*').eq('id', id).single(),
  findByName: (name) => supabase.from('raw_ingredients').select('stock_quantity').eq('name', name).single(),
  create: (data) => supabase.from('raw_ingredients').insert(data).select().single(),
  update: (id, data) => supabase.from('raw_ingredients').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('raw_ingredients').delete().eq('id', id),
  setStock: (id, stock_quantity) =>
    supabase.from('raw_ingredients').update({ stock_quantity }).eq('id', id).select().single(),
  deductByName: async (name, qty) => {
    const { data } = await supabase.from('raw_ingredients').select('stock_quantity').eq('name', name).single();
    if (!data) return;
    return supabase.from('raw_ingredients')
      .update({ stock_quantity: Math.max(0, data.stock_quantity - qty) })
      .eq('name', name);
  },
};

export { IngredientModel };