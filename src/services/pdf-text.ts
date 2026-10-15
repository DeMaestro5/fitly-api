import { PDFParse } from 'pdf-parse';
import { AppError } from '../utils/AppError';

const MIN_TEXT_LENGTH = 100;

/**
 * Reads the text out of a PDF. Link annotations are written into the text as
 * [label](https://full-url), so the real URLs survive.
 */
export async function extractPdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ parseHyperlinks: true });
    const text = result.text.trim();
    if (text.length < MIN_TEXT_LENGTH) {
      throw new AppError(
        422,
        'This PDF has no selectable text (it may be a scan). Upload the PDF you exported from your editor'
      );
    }
    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'That file could not be read as a PDF.');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
