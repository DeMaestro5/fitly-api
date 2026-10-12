import puppeteer, { type Browser, type Page } from 'puppeteer';
import { AppError } from '../utils/AppError';

export interface PdfService {
  render(html: string): Promise<Buffer>;
  close(): Promise<void>;
}

export function createPdfService(): PdfService {
  let browserPromise: Promise<Browser> | null = null;

  // One shared browser, started on first use. Each render uses its own short-lived page.
  const getBrowser = (): Promise<Browser> => {
    if (!browserPromise) {
      browserPromise = puppeteer
        .launch({
          headless: true,
          // Set PUPPETEER_NO_SANDBOX=true only inside Docker or CI containers
          args:
            process.env.PUPPETEER_NO_SANDBOX === 'true'
              ? ['--no-sandbox', '--disable-setuid-sandbox']
              : [],
        })
        .then((browser) => {
          browser.on('disconnected', () => {
            browserPromise = null;
          });
          return browser;
        })
        .catch((err) => {
          browserPromise = null;
          throw err;
        });
    }
    return browserPromise;
  };

  return {
    async render(html) {
      let page: Page | undefined;
      try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setJavaScriptEnabled(false); // templates are static HTML, no scripts needed
        await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        });
        return Buffer.from(pdf);
      } catch (err) {
        console.error('PDF render failed:', err);
        throw new AppError(500, 'Could not generate the PDF');
      } finally {
        await page?.close().catch(() => undefined);
      }
    },

    async close() {
      const pending = browserPromise;
      browserPromise = null;
      const browser = await pending?.catch(() => null);
      await browser?.close();
    },
  };
}
