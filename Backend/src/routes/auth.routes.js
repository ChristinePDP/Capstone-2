// 1. I-import muna ang Router mula sa express
import { Router } from 'express';

// 2. Wag kalimutan ang .js sa dulo ng sarili mong files!
import { AuthController } from '../controller/auth.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

// I-initialize ang router
const router = Router();

router.post('/login', AuthController.login);
router.post('/logout', authMiddlewareJwt, AuthController.logout);
router.get('/me', authMiddlewareJwt, AuthController.me);

// 3. Gawing default export para malinis i-import sa App.js
export default router;