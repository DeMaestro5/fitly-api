import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler, notFound } from './middleware/errorHandler';
import path from 'node:path';
import { createMasterResumeController } from './controllers/masterResume';
import { createFileResumeRepository } from './repo/resume.repo';
import { createMasterResumeRouter } from './routes/master-resume';
import { createMasterResumeService } from './services/masterResume';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const resumeRepo = createFileResumeRepository(
    path.resolve(process.cwd(), 'data/master-resume.json')
  );
  const masterResumeController = createMasterResumeController(
    createMasterResumeService(resumeRepo)
  );

  app.use(
    '/api/master-resume',
    createMasterResumeRouter(masterResumeController)
  );
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
