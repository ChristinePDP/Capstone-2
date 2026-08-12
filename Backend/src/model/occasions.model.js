// backend/model/occasions.model.js
import { getSupabase } from '../config/supabase.js';

const TABLE_NAME = 'occasions';

export const OccasionModel = {
  // Kunin lahat ng occasions. Pwedeng i-filter para active lang
  async findAll({ activeOnly = false } = {}) {
    let query = getSupabase()
      .from(TABLE_NAME)
      .select('*')
      .order('start_month', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(`OccasionModel.findAll Error: ${error.message}`);
    return data;
  },

  // Kunin ang isang occasion base sa id
  async findById(id) {
    const { data, error } = await getSupabase()
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(`OccasionModel.findById Error: ${error.message}`);
    return data;
  },

  // Gumawa ng bagong occasion
  async create(occasionRows) {
    const rows = Array.isArray(occasionRows) ? occasionRows : [occasionRows];

    const { data, error } = await getSupabase()
      .from(TABLE_NAME)
      .insert(rows)
      .select();

    if (error) throw new Error(`OccasionModel.create Error: ${error.message}`);
    return Array.isArray(data) ? data[0] : data;
  },

  // I-update ang existing occasion base sa id
  async update(id, occasionData) {
    const { data, error } = await getSupabase()
      .from(TABLE_NAME)
      .update(occasionData)
      .eq('id', id)
      .select();

    if (error) throw new Error(`OccasionModel.update Error: ${error.message}`);
    return Array.isArray(data) ? data[0] : data;
  },

  // Burahin ang occasion base sa id
  async remove(id) {
    const { data, error } = await getSupabase()
      .from(TABLE_NAME)
      .delete()
      .eq('id', id)
      .select();

    if (error) throw new Error(`OccasionModel.remove Error: ${error.message}`);
    return Array.isArray(data) ? data[0] : data;
  }
};