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
      .maybeSingle(); // huwag mag-throw kapag walang match, null lang ibalik

    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .insert(payload)
      .select()
      .single(); // ok gamitin dito: laging eksaktong 1 row ang dapat ibalik ng insert

    if (error) throw error;
    return { data, error: null };
  },

  async update(id, payload) {
    // .select() lang (walang .single()) para hindi mag-throw ng PGRST116
    // kapag walang row na nag-match (nadelete na, mali ang id, etc).
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) throw error;

    // 0 rows matched -> wala talagang bundle na ganoong id, hindi ito
    // dapat maging generic 500 error.
    if (!data || data.length === 0) {
      return { data: null, error: null, notFound: true };
    }

    return { data: data[0], error: null };
  },

  async delete(id) {
    // Ganoon din dito: .select() lang, hindi .single(), para hindi
    // sumabog kapag ang row ay nadelete na dati (idempotent na delete).
    const { data, error } = await getSupabase()
      .from('promo_bundles')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return { data: null, error: null, notFound: true };
    }

    return { data: data[0], error: null };
  },
};

export { BundleModel };