import { getSupabase } from '../config/supabase.js';

const TABLE = 'customers';

const CustomersModel = {
  async create(payload) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert([payload])
      .select('id')
      .single();
      
    if (error) throw error;
    return data;
  },

  async deleteById(id) {
    const { error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

export { CustomersModel };