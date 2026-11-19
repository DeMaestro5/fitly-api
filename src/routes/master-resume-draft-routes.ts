import { Router, raw } from 'express';
import { MasterResumeDraftController } from '../controllers/masterResumeDraft';
import { renderRateLimit, tailorRateLimit } from '../middleware/rate-limit';

export function createMasterResumeDraftRouter(
  controller: MasterResumeDraftController,
) {
  const router = Router();
  router.post(
    '/import',
    tailorRateLimit,
    raw({ type: 'application/pdf', limit: '10mb' }),
    controller.importPdf,
  );
  router.post('/preview', renderRateLimit, controller.preview);
  router.post('/pdf', renderRateLimit, controller.pdf);
  return router;
}
