import express, { Router, type RequestHandler } from 'express';
import type { TailorController } from '../controllers/tailor-controller';
import { tailorRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { TailorRequestSchema } from '../schemas/api.schema';

// Lets you send the raw pasted text as the whole body (Content-Type: text/plain),
// so nothing needs escaping. JSON bodies keep working unchanged.
const plainText = express.text({ type: 'text/plain', limit: '1mb' });
const wrapPlainText: RequestHandler = (req, _res, next) => {
  if (typeof req.body === 'string') req.body = { jobDescription: req.body };
  next();
};

export function createTailorRouter(controller: TailorController) {
  const router = Router();
  router.post(
    '/',
    tailorRateLimit,
    plainText,
    wrapPlainText,
    validate(TailorRequestSchema),
    controller.tailor
  );
  return router;
}
