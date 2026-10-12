import { Router } from 'express';
import type { RenderController } from '../controllers/render-controller';
import { renderRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { RenderRequestSchema } from '../schemas/api.schema';

export function createRenderRouter(controller: RenderController) {
  const router = Router();
  router.post(
    '/',
    renderRateLimit,
    validate(RenderRequestSchema),
    controller.render
  );
  return router;
}

export function createTemplatesRouter(controller: RenderController) {
  const router = Router();
  router.get('/', controller.templates);
  return router;
}
