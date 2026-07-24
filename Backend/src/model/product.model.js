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
};

export { ProductModel };
