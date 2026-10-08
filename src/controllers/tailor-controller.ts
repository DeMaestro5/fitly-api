import type { Request, Response } from 'express';
import type { TailorRequest } from '../schemas/api.schema';
import type { TailorService } from '../services/tailor-service';

export function createTailorController(service: TailorService) {
  return {
    tailor: async (req: Request, res: Response) => {
      const { jobDescription } = req.body as TailorRequest;
      res.json(await service.tailor(jobDescription));
    },
  };
}

export type TailorController = ReturnType<typeof createTailorController>;
