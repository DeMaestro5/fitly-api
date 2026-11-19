import { Router } from 'express';
import type { AuthController } from '../controllers/auth-controller';
import { requireAuth } from '../middleware/auth';
import {
  loginRateLimit,
  refreshRateLimit,
  registerRateLimit,
} from '../middleware/rate-limit';

export function createAuthRouter(controller: AuthController) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post('/register', registerRateLimit, controller.register);
  router.post('/login', loginRateLimit, controller.login);
  router.post('/refresh', refreshRateLimit, controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  return router;
}
