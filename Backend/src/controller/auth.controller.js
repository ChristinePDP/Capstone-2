import { AuthService } from'../services/auth.service.js';
import { ok, fail } from '../utils/response.js';
import { LoginSchema } from '../schemas/index.js';

const AuthController = {

  login: async (req, res, next) => {
    try {
      const body   = LoginSchema.parse(req.body);
      // Ang result dito ay may kasamang { token, admin } base sa auth.service.js
      const result = await AuthService.login(body.email, body.password); 
      
      // 1. I-set ang JWT bilang HttpOnly Cookie
      res.cookie('token', result.token, {
        httpOnly: true, // Pinipigilan ang pag-access ng JavaScript (XSS protection)
        secure: process.env.NODE_ENV === 'production', // True dapat kapag naka-HTTPS na (sa production)
        sameSite: 'strict', // Pinoprotektahan ka sa CSRF attacks
        maxAge: 8 * 60 * 60 * 1000 // 8 hours (tugma sa '8h' expiry ng JWT mo)
      });

      // 2. I-return lang ang admin data (wag na isama ang token sa JSON body)
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
    // 3. I-clear ang cookie kapag nag-logout para mawala ang session
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

};

export { AuthController };