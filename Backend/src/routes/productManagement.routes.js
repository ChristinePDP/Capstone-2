import express from 'express';
import multer from 'multer';
// Tinanggal ang "s" sa "controller" para tumugma sa folder structure mo
import { addProduct, uploadProductImage } from '../controller/productManagement.controller.js';
import {
  getOccasions,
  getOccasion,
  addOccasion,
  editOccasion,
  removeOccasion,
  getHomepageAds,
  getEventAds,
  regenerateHomepageAds,
  regenerateEventAds
} from '../controller/productManagement.controller.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/add', addProduct);
router.post('/upload-image', upload.single('image'), uploadProductImage);

// ============================================================
// OCCASIONS CRUD (para sa Occasion Manager)
// ============================================================
router.get('/occasions', getOccasions);
router.get('/occasions/:id', getOccasion);
router.post('/occasions', addOccasion);
router.put('/occasions/:id', editOccasion);
router.delete('/occasions/:id', removeOccasion);
router.get('/homepage-ads', getHomepageAds);

// Event Ads Modal — hiwalay sa best sellers, lalabas lang kapag may live occasion
router.get('/event-ads', getEventAds);

// Manual triggers — para sa testing, o pwede ring i-schedule via cron sa
// server mo (hal. tumawag dito once a day). Walang required body.
router.post('/homepage-ads/regenerate', regenerateHomepageAds);
router.post('/event-ads/regenerate', regenerateEventAds);

export default router;