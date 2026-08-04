import express from 'express';
import multer from 'multer';
// Tinanggal ang "s" sa "controller" para tumugma sa folder structure mo
import { addProduct, uploadProductImage } from '../controller/productManagement.controller.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/add', addProduct);
router.post('/upload-image', upload.single('image'), uploadProductImage);

export default router;