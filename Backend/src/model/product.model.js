import { supabase, getSupabase } from '../config/supabase.js';

const ProductModel = {
  async findAll(filters = {}) {
    let query = getSupabase()
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (filters.category && filters.category !== 'All') {
      query = query.eq('category', filters.category);
    }

    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    if (filters.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    return query;
  },

  async findById(id) {
    return getSupabase()
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
  },

  async create(payload) {
    return getSupabase()
      .from('products')
      .insert(payload)
      .select()
      .single();
  },
  
  async update(id, payload) {
    const { data, error } = await getSupabase()
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error };
  },
    async delete(id) {
    const { data, error } = await getSupabase()
      .from('products')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error };
  },

  /**
   * Ibawas ang `qty` sa stock_quantity ng product na may pangalang
   * `name`. Ginagamit ito kapag nag-log ng "unsold/damaged product"
   * bilang waste — dati, WALANG nangyayari dito (hindi na-deduct ang
   * product stock kapag waste_type === 'product'), kaya nananatiling
   * mali ang "Finished Production" count.
   */
  deductByName: async (name, qty) => {
    const { data } = await getSupabase().from('products').select('stock_quantity').eq('name', name).single();
    if (!data) return;
    const current = Number(data.stock_quantity || 0);
    return getSupabase().from('products')
      .update({ stock_quantity: Math.max(0, current - Number(qty)) })
      .eq('name', name);
  },

  /**
   * Kabaligtaran ng deductByName — idinadagdag pabalik ang `qty`.
   * Ginagamit ito kapag "vinoid" (kinansela) ang isang waste log na
   * dati ay nagbawas ng product stock — para maibalik sa dating stock
   * bago naganap ang maling log.
   */
  restoreByName: async (name, qty) => {
    const { data } = await getSupabase().from('products').select('stock_quantity').eq('name', name).single();
    if (!data) return;
    const current = Number(data.stock_quantity || 0);
    return getSupabase().from('products')
      .update({ stock_quantity: current + Number(qty) })
      .eq('name', name);
  },
};

export { ProductModel };