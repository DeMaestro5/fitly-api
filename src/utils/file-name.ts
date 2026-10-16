/** Letters, digits and hyphens only; everything else becomes one underscore. */
export function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

/** A safe download name ending in .pdf. Uses `fallback` when nothing usable is left. */
export function sanitizeFileName(
  requested: string | undefined,
  fallback: string
): string {
  const base = slug((requested ?? '').trim().replace(/\.pdf$/i, '')).slice(
    0,
    100
  );
  return `${base || fallback}.pdf`;
}

/** The name offered before downloading, without the extension: Stephen_Ossiakeme_Resume_Xebia */
export function suggestFileName(
  fullName: string,
  company: string | null
): string {
  const parts = [
    slug(fullName),
    'Resume',
    company ? slug(company).slice(0, 40) : '',
  ].filter(Boolean);
  return parts.join('_');
}
