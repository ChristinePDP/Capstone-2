import { Router } from 'express';

import { AuthController } from '../controller/auth.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', AuthController.login);
router.post('/logout', authMiddlewareJwt, AuthController.logout);
router.get('/me', authMiddlewareJwt, AuthController.me);

// NEW: forgot password flow
router.post('/forgot-password', AuthController.requestReset);

router.post('/verify-otp', AuthController.verifyOtpOnly); 
router.post('/reset-password', AuthController.verifyReset);

export default router;