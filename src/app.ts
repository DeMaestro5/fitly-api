import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { errorHandler, notFound } from './middleware/errorHandler';
import { createMasterResumeController } from './controllers/masterResume';
import { createFileResumeRepository } from './repo/resume.repo';
import { createMasterResumeRouter } from './routes/master-resume';
import { createMasterResumeService } from './services/masterResume';
import { createTailorService } from './services/tailor-service';
import { createGroqService } from './services/groq-service';
import { createTailorController } from './controllers/tailor-controller';
import { createTailorRouter } from './routes/tailor-routes';
import { createJobPostingService } from './services/jobPosting-service';
import { createPdfService } from './services/pdf-service';
import { createRenderService } from './services/render-service';
import { createRenderController } from './controllers/render-controller';
import {
  createRenderRouter,
  createTemplatesRouter,
} from './routes/render-routes';
import { createResumeImportService } from './services/resume-import-service';
import { createGroqComplete } from './services/groq-complete';
import { createMasterResumeDraftRouter } from './routes/master-resume-draft-routes';
import { createMasterResumeDraftController } from './controllers/masterResumeDraft';
import { closeDb } from './repo/db';
import { buildSources } from './sources';
import { createJobsService } from './services/jobs-service';
import { createJobsController } from './controllers/jobs-controller';
import { createJobsRouter } from './routes/jobs-routes';
import { createScheduler } from './services/scheduler';
import { createEmailService } from './services/email-service';

export function createApp() {
  const pdfService = createPdfService();
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const resumeRepo = createFileResumeRepository(
    path.resolve(process.cwd(), 'data/master-resume.json'),
  );
  const masterResumeService = createMasterResumeService(resumeRepo);
  const llm = createGroqService();
  const tailorService = createTailorService({
    masterResume: masterResumeService,
    llm,
    jobPosting: createJobPostingService(llm),
  });

  const renderService = createRenderService({
    masterResume: masterResumeService,
    pdf: pdfService,
  });
  const renderController = createRenderController(renderService);

  const sources = buildSources(); // if try-refresh passes an API key, pass the same one here
  const emailService = createEmailService({ llm, vocabulary: [] });
  const jobsService = createJobsService({
    sources,
    emailService,
    loadMasterResume: () => masterResumeService.get(),
  });

  const importService = createResumeImportService({
    complete: createGroqComplete(),
  });

  app.use(
    '/api/master-resume',
    createMasterResumeDraftRouter(
      createMasterResumeDraftController(importService, renderService),
    ),
  );

  app.use(
    '/api/master-resume',
    createMasterResumeRouter(createMasterResumeController(masterResumeService)),
  );
  app.use(
    '/api/tailor',
    createTailorRouter(createTailorController(tailorService)),
  );
  app.use('/api/render', createRenderRouter(renderController));
  app.use('/api/templates', createTemplatesRouter(renderController));
  app.use('/api/jobs', createJobsRouter(createJobsController(jobsService)));

  const scheduler = createScheduler({ sources });

  app.use(notFound);
  app.use(errorHandler);
  return {
    app,
    startScheduler: () => scheduler.start(),
    close: async () => {
      scheduler.stop();
      try {
        closeDb(); // lets SQLite finish writing cleanly
      } finally {
        await pdfService.close();
      }
    },
  };
}
