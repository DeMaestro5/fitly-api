import { NextFunction, Request, Response } from 'express';
import {
  ListJobsQuerySchema,
  PatchJobBodySchema,
  RefreshQuerySchema,
} from '../schemas/jobs-api.schema';
import {
  JobNotFoundError,
  JobsService,
  MasterResumeMissingError,
  NoApplyEmailError,
  UnknownSourceError,
} from '../services/jobs-service';
import { EmailDraftError } from '../services/email-service';
import { userIdOf } from '../middleware/auth';

export function createJobsController(service: JobsService) {
  return {
    async list(req: Request, res: Response) {
      const parsed = ListJobsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameter',
          issues: parsed.error.issues,
        });
        return;
      }

      const filters = parsed.data;
      const { items, total } = await service.list(userIdOf(req), filters);
      res.json({
        items,
        total,
        page: filters.page,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      });
    },

    async get(req: Request, res: Response) {
      const job = await service.get(userIdOf(req), String(req.params.id));
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json(job);
    },

    async update(req: Request, res: Response) {
      const parsed = PatchJobBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'Invalid body', issues: parsed.error.issues });
        return;
      }
      const job = await service.update(
        userIdOf(req),
        String(req.params.id),
        parsed.data,
      );
      if (!job) {
        res.status(404).json({ error: 'job not found' });
        return;
      }
      res.json(job);
    },

    async refresh(req: Request, res: Response, next: NextFunction) {
      const parsed = RefreshQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameter',
          issues: parsed.error.issues,
        });
        return;
      }
      try {
        const reports = await service.refresh(parsed.data);
        res.json({ reports });
      } catch (error) {
        if (error instanceof UnknownSourceError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    async draftEmail(req: Request, res: Response, next: NextFunction) {
      try {
        const draft = await service.draftEmail(
          userIdOf(req),
          String(req.params.id),
        );
        res.json(draft);
      } catch (error) {
        if (error instanceof JobNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (
          error instanceof NoApplyEmailError ||
          error instanceof MasterResumeMissingError
        ) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof EmailDraftError) {
          res.status(502).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    async sources(_req: Request, res: Response) {
      res.json({ sources: await service.sources() });
    },
  };
}

export type JobsController = ReturnType<typeof createJobsController>;
