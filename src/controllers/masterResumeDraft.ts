import { Request, Response } from 'express';
import z from 'zod';
import { MasterResumeSchema } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import type { ResumeImportService } from '../services/resume-import-service';
import type { RenderService } from '../services/render-service';

const DraftRequestSchema = z.object({
  resume: MasterResumeSchema,
  templateId: z.string().min(1).default('classic'),
});

function parseDraft(body: unknown) {
  const parsed = DraftRequestSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.slice(1).join('.') || 'resume'} : ${issue.message}`
  );
  const shown = issues.slice(0, 3).join('; ');
  const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : '';
  throw new AppError(400, `${shown}${more}`);
}

export function createMasterResumeDraftController(
  importer: ResumeImportService,
  renderer: RenderService
) {
  return {
    importPdf: async (req: Request, res: Response) => {
      const body: unknown = req.body;
      if (
        !Buffer.isBuffer(body) ||
        body.length === 0 ||
        body.subarray(0, 5).toString() !== '%PDF-'
      )
        throw new AppError(
          400,
          'Send a PDF file as the request body with Content-Type: application/pdf'
        );
      res.json(await importer.importPdf(body));
    },

    preview: async (req: Request, res: Response) => {
      const { resume, templateId } = parseDraft(req.body);
      const html = await renderer.previewDraft(resume, templateId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
      );
      res.send(html);
    },

    pdf: async (req: Request, res: Response) => {
      const { resume, templateId } = parseDraft(req.body);
      const { pdf, fileName } = await renderer.renderDraft(resume, templateId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );
      res.send(pdf);
    },
  };
}
export type MasterResumeDraftController = ReturnType<
  typeof createMasterResumeDraftController
>;
