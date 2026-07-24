import { supabase } from '../config/supabase.js';

const MaterialModel = {
  findAll: () => supabase.from('celebration_materials').select('*').order('name'),
  findById: (id) => supabase.from('celebration_materials').select('*').eq('id', id).single(),
  findByName: (name) => supabase.from('celebration_materials').select('stock_quantity').eq('name', name).single(),
  create: (data) => supabase.from('celebration_materials').insert(data).select().single(),
  update: (id, data) => supabase.from('celebration_materials').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('celebration_materials').delete().eq('id', id),
  setStock: (id, stock_quantity) =>
    supabase.from('celebration_materials').update({ stock_quantity }).eq('id', id).select().single(),
  deductByName: async (name, qty) => {
    const { data } = await supabase.from('celebration_materials').select('stock_quantity').eq('name', name).single();
    if (!data) return;
    return supabase.from('celebration_materials')
      .update({ stock_quantity: Math.max(0, data.stock_quantity - qty) })
      .eq('name', name);
  },
};

export { MaterialModel };