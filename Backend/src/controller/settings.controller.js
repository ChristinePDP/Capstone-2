import { getPaymentSettings, savePaymentQr, deletePaymentQr } from '../services/settings.service.js';

const MAX_QR_SIZE = 5 * 1024 * 1024;

export async function getPaymentSettingsController(_req, res, next) {
  try {
    const data = await getPaymentSettings();
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function uploadPaymentQr(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'QR code image is required.' });
    if (!req.file.mimetype?.startsWith('image/') || req.file.size > MAX_QR_SIZE) {
      return res.status(400).json({ success: false, message: 'QR code must be an image no larger than 5MB.' });
    }
    const data = await savePaymentQr(req.file, req.user?.id);
    res.json({ success: true, data });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
}

export async function removePaymentQr(_req, res, next) {
  try {
    res.json({ success: true, data: await deletePaymentQr() });
  } catch (error) { next(error); }
}
