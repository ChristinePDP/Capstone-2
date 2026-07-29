import { supabase } from '../config/supabase.js';

const TABLE = 'analytics_cache';

const AnalyticsCacheModel = {
  getByKey: async (cacheKey) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('payload, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  upsert: async (cacheKey, payload, ttlMs) => {
    const expires_at = new Date(Date.now() + ttlMs).toISOString();

    const { error } = await supabase
      .from(TABLE)
      .upsert({ cache_key: cacheKey, payload, expires_at }, { onConflict: 'cache_key' });

    if (error) throw error;
  },
};

export { AnalyticsCacheModel };