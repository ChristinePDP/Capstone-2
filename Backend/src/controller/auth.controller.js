import { AuthService } from '../services/auth.service.js';
import { ok, fail } from '../utils/response.js';
import { LoginSchema, RequestOtpSchema, VerifyOtpSchema, VerifyOtpOnlySchema } from '../schemas/index.js';

const AuthController = {

  login: async (req, res, next) => {
    try {
      const body   = LoginSchema.parse(req.body);
      const result = await AuthService.login(body.email, body.password);

      res.cookie('token', result.token, {
        httpOnly: true,
        secure: true,           
        sameSite: 'none',      
        maxAge: 8 * 60 * 60 * 1000
      });

      ok(res, { admin: result.admin }, 'Login successful');
    } catch (err) {
      if (err.message?.toLowerCase().includes('credential') ||
          err.message?.toLowerCase().includes('password') ||
          err.message?.toLowerCase().includes('invalid')) {
        return res.status(401).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  logout: (_req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    ok(res, null, 'Logged out');
  },

  me: async (req, res, next) => {
    try {
      const admin = await AuthService.getProfile(req.admin.id);
      ok(res, admin);
    } catch (err) { next(err); }
  },

  // hakbang 1 — request OTP
  requestReset: async (req, res, next) => {
    try {
      const body   = RequestOtpSchema.parse(req.body);
      const result = await AuthService.requestPasswordReset(body.email);
      ok(res, result, 'OTP sent to your email');
    } catch (err) { next(err); }
  },

  // ✅ BAGONG HAKBANG: i-verify lang yung OTP kung tama (bago ipakita ang password form)
  verifyOtpOnly: async (req, res, next) => {
    try {
      const body = VerifyOtpOnlySchema.parse(req.body);
      await AuthService.verifyOtpOnly(body.email, body.otp);
      ok(res, null, 'OTP is valid');
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, message: 'Invalid OTP format' });
      }
      res.status(400).json({ success: false, message: err.message || 'Invalid or expired OTP' });
    }
  },

  // hakbang 2 — verify OTP + set new password
  verifyReset: async (req, res, next) => {
    try {
      const body   = VerifyOtpSchema.parse(req.body);
      const result = await AuthService.verifyResetOtp(body.email, body.otp, body.newPassword);
      ok(res, result, 'Password reset successful');
    } catch (err) { next(err); }
  },

};

export { AuthController };
