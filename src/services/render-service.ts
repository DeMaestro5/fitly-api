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

// Screen-only styles so the preview looks like a sheet of paper in an iframe.
// The PDF is rendered with print media, so none of this reaches the PDF.
const PREVIEW_CSS = `
  @media screen {
    html { background: #e5e7eb; }
    body {
      max-width: 210mm;
      margin: 16px auto;
      padding: 12mm 14mm;
      background: #fff;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
    }
  }
`;

export function createRenderService({ masterResume, pdf }: RenderDeps) {
  // Shared by render() and preview() so both always produce the same HTML.
  async function buildHtml(tailorable: Tailorable, templateId: string) {
    const template = getTemplate(templateId);
    if (!template) throw new AppError(400, `Unknown template "${templateId}"`);

    // Locked fields (name, contact, dates...) always come from the master resume
    const master = await masterResume.get();
    const resume = buildResume(master, tailorable);

    return { html: template.render(resume), resume };
  }

  return {
    async render(
      tailorable: Tailorable,
      templateId: string
    ): Promise<RenderedResume> {
      const { html, resume } = await buildHtml(tailorable, templateId);

      const safeName = resume.locked.basics.fullName
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      return {
        pdf: await pdf.render(html),
        fileName: `${safeName || 'Resume'}_Resume.pdf`,
      };
    },

    async preview(tailorable: Tailorable, templateId: string): Promise<string> {
      const { html } = await buildHtml(tailorable, templateId);
      return html.replace('</head>', `<style>${PREVIEW_CSS}</style></head>`);
    },
  };
}

export type RenderService = ReturnType<typeof createRenderService>;
