import { Router } from 'express';
import type { MasterResumeController } from '../controllers/masterResume';
import { validate } from '../middleware/validate';
import { MasterResumeSchema } from '../schemas/resume.schema';

export function createMasterResumeRouter(controller: MasterResumeController) {
  const router = Router();
  router.get('/', controller.get);
  router.put('/', validate(MasterResumeSchema), controller.replace);
  return router;
}
