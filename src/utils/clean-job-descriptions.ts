export function cleanJobDescription(raw: string): string {
  return raw
    .replace(/[\u00A0\u2009\u202F]/g, ' ')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
