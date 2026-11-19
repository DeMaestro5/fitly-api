import { Router } from 'express';
import { JobsController } from '../controllers/jobs-controller';
import { tailorRateLimit } from '../middleware/rate-limit';

export function createJobsRouter(controller: JobsController) {
  const router = Router();

  router.get('/', controller.list);
  router.get('/sources', controller.sources);
  router.post('/refresh', controller.refresh);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/email', tailorRateLimit, controller.draftEmail);

  return router;
}
