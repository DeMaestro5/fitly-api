import { NextFunction, Request, Response } from 'express';
import {
  ListJobsQuerySchema,
  PatchJobBodySchema,
  RefreshQuerySchema,
} from '../schemas/jobs-api.schema';
import { JobsService, UnknownSourceError } from '../services/jobs-service';

export function createJobsController(service: JobsService) {
  return {
    list(req: Request, res: Response) {
      const parsed = ListJobsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameter',
          issues: parsed.error.issues,
        });
        return;
      }

      const filters = parsed.data;
      const { items, total } = service.list(filters);
      res.json({
        items,
        total,
        page: filters.page,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      });
    },

    get(req: Request, res: Response) {
      const job = service.get(String(req.params.id));
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json(job);
    },

    update(req: Request, res: Response) {
      const parsed = PatchJobBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'Invalid body', issues: parsed.error.issues });
        return;
      }
      const job = service.update(String(req.params.id), parsed.data);
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

    sources(_req: Request, res: Response) {
      res.json({ sources: service.sources() });
    },
  };
}

export type JobsController = ReturnType<typeof createJobsController>;
