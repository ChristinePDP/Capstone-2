import express from 'express';
import multer from 'multer';
import { 
  getProducts,
  addProduct, 
  editProduct,
  removeProduct,
  uploadProductImage,
  removeUploadedImage,
  cleanupOrphanImages,
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

// Limitahan ang upload para hindi mapuno ang bucket: max size at allowlist ng
// image types (walang SVG dahil public ang bucket at puwedeng may script).
const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, GIF, or AVIF images are allowed.'));
  }
});

// Para JSON na 400 ang lumabas (hindi generic 500/HTML) kapag lumampas sa size o mali ang type.
const uploadSingleImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? `Image is too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.`
        : err.message || 'Invalid image upload.';
    return res.status(400).json({ success: false, message });
  });
};

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
// NOTE: dapat NASA ITAAS ng router.delete('/:id') ang '/upload-image',
// kung hindi ay mate-treat itong id = "upload-image".
router.delete('/upload-image', removeUploadedImage);
router.post('/images/cleanup', cleanupOrphanImages);
router.delete('/:id', removeProduct);
router.post('/upload-image', uploadSingleImage, uploadProductImage);
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