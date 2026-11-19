import express, { Router, type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requireAuth, userIdOf } from './middleware/auth';
import { createMasterResumeController } from './controllers/masterResume';
import { createResumeRepository } from './repo/resume.repo';
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
import { createAuthService } from './services/auth-service';
import { createAuthController } from './controllers/auth-controller';
import { createAuthRouter } from './routes/auth-routes';
import { scoreUser } from './services/job-scoring-service';

export function createApp() {
  const pdfService = createPdfService();
  const app = express();

  // Behind Render's proxy, req.ip is the proxy unless we trust its forwarded header.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const resumeRepo = createResumeRepository();
  const masterResumeService = createMasterResumeService(resumeRepo, {
    // A new or edited resume changes job scores, so re-score for that user right away.
    onSaved: (userId, resume) => {
      void scoreUser(userId, resume).catch((err) =>
        console.warn('[scoring] failed after resume save:', err),
      );
    },
  });
  const llm = createGroqService();
  const jobPosting = createJobPostingService(llm);
  const importService = createResumeImportService({
    complete: createGroqComplete(),
  });

  const sources = buildSources(); // if try-refresh passes an API key, pass the same one here
  const emailService = createEmailService({ llm, vocabulary: [] });
  const jobsService = createJobsService({
    sources,
    emailService,
    loadMasterResume: (userId) => resumeRepo.get(userId),
  });

  // These services only need "the signed-in user's master resume", so each request
  // gets copies bound to that user. The service files themselves stay unchanged.
  const perUser =
    (build: (userId: string) => Router): RequestHandler =>
    (req, res, next) =>
      build(userIdOf(req))(req, res, next);

  const buildRenderService = (userId: string) =>
    createRenderService({
      masterResume: masterResumeService.forUser(userId),
      pdf: pdfService,
    });

  // Public: register, login, refresh, logout.
  app.use(
    '/api/auth',
    createAuthRouter(createAuthController(createAuthService())),
  );

  // Everything mounted below this line requires a valid access token.
  app.use('/api', requireAuth);

  app.use(
    '/api/master-resume',
    perUser((userId) =>
      createMasterResumeDraftRouter(
        createMasterResumeDraftController(
          importService,
          buildRenderService(userId),
        ),
      ),
    ),
  );
  app.use(
    '/api/master-resume',
    perUser((userId) =>
      createMasterResumeRouter(
        createMasterResumeController(masterResumeService.forUser(userId)),
      ),
    ),
  );
  app.use(
    '/api/tailor',
    perUser((userId) =>
      createTailorRouter(
        createTailorController(
          createTailorService({
            masterResume: masterResumeService.forUser(userId),
            llm,
            jobPosting,
          }),
        ),
      ),
    ),
  );
  app.use(
    '/api/render',
    perUser((userId) =>
      createRenderRouter(createRenderController(buildRenderService(userId))),
    ),
  );
  app.use(
    '/api/templates',
    perUser((userId) =>
      createTemplatesRouter(createRenderController(buildRenderService(userId))),
    ),
  );
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
        await closeDb(); // waits for in-flight queries, then closes the pool
      } finally {
        await pdfService.close();
      }
    },
  };
}
