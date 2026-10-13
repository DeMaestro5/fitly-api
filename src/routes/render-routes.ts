import { Router } from 'express';
import type { RenderController } from '../controllers/render-controller';
import { renderRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { RenderRequestSchema } from '../schemas/api.schema';

export function createRenderRouter(controller: RenderController) {
  const router = Router();

  // POST /api/render -> PDF
  router.post(
    '/',
    renderRateLimit,
    validate(RenderRequestSchema),
    controller.render
  );

  // POST /api/render/preview -> HTML (no Puppeteer, so no render rate limit)
  router.post('/preview', validate(RenderRequestSchema), controller.preview);

  return router;
}

export function createTemplatesRouter(controller: RenderController) {
  const router = Router();
  router.get('/', controller.templates);
  return router;
}
