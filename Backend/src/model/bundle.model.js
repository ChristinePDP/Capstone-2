import { getSupabase } from '../config/supabase.js';

const BundleModel = {
  async findAll(filters = {}) {
    let query = getSupabase()
      .from('promo_bundles')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    if (filters.eventTag) {
      query = query.eq('event_tag', filters.eventTag);
    }

    return query;
  },

  async findById(id) {
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload) {
    return getSupabase()
      .from('promo_bundles')
      .insert(payload)
      .select()
      .single();
  },

  async update(id, payload) {
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error };
  },

  async delete(id) {
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error };
  },
};

export { BundleModel };