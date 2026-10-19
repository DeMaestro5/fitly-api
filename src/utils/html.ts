import { convert } from 'html-to-text';

export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({
        selector,
        options: { uppercase: false },
      })),
    ],
  })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Some feeds return UTF-8 text decoded as Latin-1 ("â\u0080\u0099" instead of "’"). Repair when safe.
export function fixMojibake(text: string): string {
  if (/[^\u0000-\u00ff]/.test(text)) return text; // already has real unicode
  if (!/[\u00c2\u00c3\u00e2][\u0080-\u00bf]/.test(text)) return text;
  const fixed = Buffer.from(text, 'latin1').toString('utf8');
  return fixed.includes('\uFFFD') ? text : fixed;
}

// Some feeds return HTML that was escaped twice ("&lt;div&gt;" as literal text).
export function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
