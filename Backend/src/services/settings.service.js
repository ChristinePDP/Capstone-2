import { supabase } from '../config/supabase.js';

const BUCKET = 'payment-qr';
const TABLE = 'payment_settings';

export async function getPaymentSettings() {
  const { data, error } = await supabase.from(TABLE).select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data || { payment_qr_code_url: null, payment_qr_code_path: null };
}

export async function savePaymentQr(file, adminId) {
  const current = await getPaymentSettings();
  const extension = file.originalname.split('.').pop().toLowerCase();
  const path = `qr_codes/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const payload = {
    id: true,
    payment_qr_code_url: urlData.publicUrl,
    payment_qr_code_path: path,
    updated_by: adminId || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' }).select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  if (current.payment_qr_code_path && current.payment_qr_code_path !== path) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([current.payment_qr_code_path]);
    if (cleanupError) console.error('Previous QR cleanup failed:', cleanupError);
  }
  return data;
}

export async function deletePaymentQr() {
  const current = await getPaymentSettings();
  const { error } = await supabase.from(TABLE).update({
    payment_qr_code_url: null,
    payment_qr_code_path: null,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
  if (error) throw error;
  if (current.payment_qr_code_path) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([current.payment_qr_code_path]);
    if (cleanupError) console.error('QR cleanup failed:', cleanupError);
  }
  return { payment_qr_code_url: null, payment_qr_code_path: null };
}
