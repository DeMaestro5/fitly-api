import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler, notFound } from './middleware/errorHandler';
import path from 'node:path';
import { createMasterResumeController } from './controllers/masterResume';
import { createFileResumeRepository } from './repo/resume.repo';
import { createMasterResumeRouter } from './routes/master-resume';
import { createMasterResumeService } from './services/masterResume';
import { createTailorService } from './services/tailor-service';
import { createGroqService } from './services/groq-service';
import { createTailorController } from './controllers/tailor-controller';
import { createTailorRouter } from './routes/tailor-routes';

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
  const masterResumeService = createMasterResumeService(resumeRepo);
  const tailorService = createTailorService({
    masterResume: masterResumeService,
    llm: createGroqService(),
  });

  app.use(
    '/api/master-resume',
    createMasterResumeRouter(createMasterResumeController(masterResumeService))
  );
  app.use(
    '/api/tailor',
    createTailorRouter(createTailorController(tailorService))
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
