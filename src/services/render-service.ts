import type { MasterResume, Tailorable } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import { getTemplate } from '../templates';
import type { MasterResumeService } from './masterResume';
import type { PdfService } from './pdf-service';
import { buildResume } from './resume-merge';
import { slug, sanitizeFileName } from '../utils/file-name';

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

const withPreviewStyles = (html: string) =>
  html.replace('</head>', `<style>${PREVIEW_CSS}</style></head>`);

function htmlFor(resume: MasterResume, templateId: string): string {
  const template = getTemplate(templateId);
  if (!template) throw new AppError(400, `Unknown template "${templateId}`);
  return template.render(resume);
}

function fileNameFor(resume: MasterResume, requested?: string): string {
  return sanitizeFileName(
    requested,
    `${slug(resume.locked.basics.fullName) || 'Resume'}_Resume`
  );
}

export function createRenderService({ masterResume, pdf }: RenderDeps) {
  // Locked fields (name, contact, dates...) always come from the saved master resume
  async function tailored(tailorable: Tailorable): Promise<MasterResume> {
    return buildResume(await masterResume.get(), tailorable);
  }

  return {
    async render(
      tailorable: Tailorable,
      templateId: string,
      fileName?: string
    ): Promise<RenderedResume> {
      const resume = await tailored(tailorable);
      return {
        pdf: await pdf.render(htmlFor(resume, templateId)),
        fileName: fileNameFor(resume, fileName),
      };
    },

    async preview(tailorable: Tailorable, templateId: string): Promise<string> {
      return withPreviewStyles(htmlFor(await tailored(tailorable), templateId));
    },

    // The master resume page edits an unsaved draft, so it brings every field itself.
    async renderDraft(
      resume: MasterResume,
      templateId: string
    ): Promise<RenderedResume> {
      return {
        pdf: await pdf.render(htmlFor(resume, templateId)),
        fileName: fileNameFor(resume),
      };
    },

    async previewDraft(
      resume: MasterResume,
      templateId: string
    ): Promise<string> {
      return withPreviewStyles(htmlFor(resume, templateId));
    },
  };
}

export type RenderService = ReturnType<typeof createRenderService>;
