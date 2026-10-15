import { Router, raw } from 'express';
import { MasterResumeDraftController } from '../controllers/masterResumeDraft';

export function createMasterResumeDraftRouter(
  controller: MasterResumeDraftController
) {
  const router = Router();
  router.post(
    '/import',
    raw({ type: 'application/pdf', limit: '10mb' }),
    controller.importPdf
  );
  router.post('/preview', controller.preview);
  router.post('/pdf', controller.pdf);
  return router;
}
