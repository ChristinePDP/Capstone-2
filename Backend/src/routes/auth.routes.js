import { Router } from 'express';

import { AuthController } from '../controller/auth.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';
import {
  loginRateLimiter,
  passwordRecoveryRateLimiter,
  passwordChangeRateLimiter,
} from '../middleware/authRateLimit.middleware.js';

const router = Router();

router.post('/login', loginRateLimiter, AuthController.login);
router.post('/logout', authMiddlewareJwt, AuthController.logout);
router.get('/me', authMiddlewareJwt, AuthController.me);

// Require the existing login session before allowing a password change.
router.post('/change-password', authMiddlewareJwt, passwordChangeRateLimiter, AuthController.changePassword);

// NEW: forgot password flow
router.post('/forgot-password', passwordRecoveryRateLimiter, AuthController.requestReset);

router.post('/verify-otp', passwordRecoveryRateLimiter, AuthController.verifyOtpOnly);
router.post('/reset-password', passwordRecoveryRateLimiter, AuthController.verifyReset);

export default router;