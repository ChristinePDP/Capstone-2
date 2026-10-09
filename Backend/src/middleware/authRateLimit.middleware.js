import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

// Count failed login attempts only; successful logins are removed from the bucket.
const loginRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many failed login attempts. Please try again in 15 minutes.',
  },
});

// Share one bucket across reset-email requests and OTP verification/submission,
// limiting both email spam and repeated OTP guesses from the same IP.
const passwordRecoveryRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password recovery attempts. Please try again in 15 minutes.',
  },
});

// Authenticated but repeated current-password checks should also be throttled.
const passwordChangeRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many failed password change attempts. Please try again in 15 minutes.',
  },
});

export { loginRateLimiter, passwordRecoveryRateLimiter, passwordChangeRateLimiter };
