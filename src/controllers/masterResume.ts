import type { Request, Response } from 'express';
import type { MasterResumeService } from '../services/masterResume';

export function createMasterResumeController(service: MasterResumeService) {
  return {
    get: async (_req: Request, res: Response) => {
      res.json(await service.get());
    },
    replace: async (req: Request, res: Response) => {
      res.json(await service.replace(req.body)); // body already validated by the middleware
    },
  };
}

export type MasterResumeController = ReturnType<
  typeof createMasterResumeController
>;
