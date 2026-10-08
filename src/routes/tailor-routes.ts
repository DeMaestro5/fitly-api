import { Router } from 'express';
import type { TailorController } from '../controllers/tailor-controller';
import { tailorRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { TailorRequestSchema } from '../schemas/api.schema';

export function createTailorRouter(controller: TailorController) {
  const router = Router();
  router.post(
    '/',
    tailorRateLimit,
    validate(TailorRequestSchema),
    controller.tailor
  );
  return router;
}
