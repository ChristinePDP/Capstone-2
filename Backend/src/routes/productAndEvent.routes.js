import express from 'express';
import multer from 'multer';
import { 
  getProducts,
  addProduct, 
  editProduct,
  removeProduct,
  uploadProductImage,
  getEvents,
  getEvent,
  addEvent,
  editEvent,
  removeEvent,
  getHomepageAds,
  getEventAds,
  regenerateHomepageAds,
  regenerateEventAds,
  getBundles,
  getBundle,
  addBundle,
  editBundle,
  removeBundle
} from '../controller/productAndEvent.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================
// PRODUCTS CRUD
// ============================================================
router.get('/', getProducts);

// ============================================================
// PROMO BUNDLES CRUD
// ============================================================
router.get('/bundles', getBundles);

// ============================================================
// EVENTS CRUD (Dating Occasions)
// ============================================================
router.get('/events', getEvents);

// ============================================================
// ADS GENERATORS
// ============================================================
router.get('/homepage-ads', getHomepageAds);
router.get('/event-ads', getEventAds);

// Public reads above are consumed by customer-facing pages. Admin mutations
// and management reads below require the logged-in admin session.
router.use(authMiddlewareJwt);

router.get('/bundles/:id', getBundle);
router.get('/events/:id', getEvent);
router.post('/add', addProduct);
router.put('/:id', editProduct);
router.delete('/:id', removeProduct);
router.post('/upload-image', upload.single('image'), uploadProductImage);
router.post('/bundles', addBundle);
router.put('/bundles/:id', editBundle);
router.delete('/bundles/:id', removeBundle);
router.post('/events', addEvent);
router.put('/events/:id', editEvent);
router.delete('/events/:id', removeEvent);
router.get('/homepage-ads', getHomepageAds);
router.get('/event-ads', getEventAds);
router.post('/homepage-ads/regenerate', regenerateHomepageAds);
router.post('/event-ads/regenerate', regenerateEventAds);

export default router;