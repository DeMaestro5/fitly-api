import type { Request, Response } from 'express';
import type { RenderRequest } from '../schemas/api.schema';
import type { RenderService } from '../services/render-service';
import { listTemplates } from '../templates';

export function createRenderController(service: RenderService) {
  return {
    render: async (req: Request, res: Response) => {
      const { tailorable, templateId, fileName } = req.body as RenderRequest;
      const { pdf, fileName: pdfName } = await service.render(
        tailorable,
        templateId,
        fileName
      );
      res
        .status(200)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
          'Content-Length': String(pdf.length),
        })
        .send(pdf);
    },

    preview: async (req: Request, res: Response) => {
      const { tailorable, templateId } = req.body as RenderRequest;
      const html = await service.preview(tailorable, templateId);
      res
        .status(200)
        .set({
          'Content-Type': 'text/html; charset=utf-8',
          // Static markup only: block scripts and network access.
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        })
        .send(html);
    },

    templates: (_req: Request, res: Response) => {
      res.json(listTemplates());
    },
  };
}

export type RenderController = ReturnType<typeof createRenderController>;
