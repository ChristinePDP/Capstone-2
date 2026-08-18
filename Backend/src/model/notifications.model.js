import { supabase } from '../config/supabase.js';

export const NotificationsModel = {
  async create({ type, title, message, referenceId, referenceType }) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([{ type, title, message, reference_id: referenceId, reference_type: referenceType }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findAll({ limit = 50 } = {}) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  // Dating tinatawag na ng service (`getUnreadNotifications`) pero wala pang
  // katumbas dito — kaya nagbabagsak ang GET /unread endpoint.
  async findUnread() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async markRead(id) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markAllRead() {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    if (error) throw error;
  },

  // Dating tinatawag na na ng service (`deleteNotification`) pero wala pang
  // katumbas dito — kaya nagbabagsak ang DELETE /:id endpoint.
  async remove(id) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
};