const HYPHENS = /[\u2010\u2011\u2012\u2212]/g;
const SINGLE_QUOTES = /[\u2018\u2019]/g;
const DOUBLE_QUOTES = /[\u201C\u201D]/g;
const ODD_SPACES = /[\u00A0\u2009\u202F]/g;
const ZERO_WIDTH = /[\u200B\uFEFF]/g;

export function normalizeText(value: string): string {
  return value
    .replace(HYPHENS, '-')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(ODD_SPACES, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDeep<T>(value: T): T {
  if (typeof value === 'string') return normalizeText(value) as T;
  if (Array.isArray(value)) return value.map(normalizeDeep) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, normalizeDeep(v)])
    ) as T;
  }
  return value;
}
