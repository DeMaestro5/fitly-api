import type { Tailorable } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import { getTemplate } from '../templates';
import type { MasterResumeService } from './masterResume';
import type { PdfService } from './pdf-service';
import { buildResume } from './resume-merge';

interface RenderDeps {
  masterResume: MasterResumeService;
  pdf: PdfService;
}

export interface RenderedResume {
  pdf: Buffer;
  fileName: string;
}

export function createRenderService({ masterResume, pdf }: RenderDeps) {
  return {
    async render(
      tailorable: Tailorable,
      templateId: string
    ): Promise<RenderedResume> {
      const template = getTemplate(templateId);
      if (!template)
        throw new AppError(400, `Unknown template "${templateId}"`);

      // Locked fields (name, contact, dates...) always come from the master resume
      const master = await masterResume.get();
      const resume = buildResume(master, tailorable);

      const safeName = resume.locked.basics.fullName
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      return {
        pdf: await pdf.render(template.render(resume)),
        fileName: `${safeName || 'Resume'}_Resume.pdf`,
      };
    },
  };
}

export type RenderService = ReturnType<typeof createRenderService>;
