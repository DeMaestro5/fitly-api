import type { Request, Response } from 'express';
import type { RenderRequest } from '../schemas/api.schema';
import type { RenderService } from '../services/render-service';
import { listTemplates } from '../templates';

export function createRenderController(service: RenderService) {
  return {
    render: async (req: Request, res: Response) => {
      const { tailorable, templateId } = req.body as RenderRequest;
      const { pdf, fileName } = await service.render(tailorable, templateId);
      res
        .status(200)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': String(pdf.length),
        })
        .send(pdf);
    },
    templates: (_req: Request, res: Response) => {
      res.json(listTemplates());
    },
  };
}

export type RenderController = ReturnType<typeof createRenderController>;
