import { normalizeText } from './skills-dictionary';

export interface BoilerplateJob {
  id: string;
  company: string;
  title: string;
  descriptionText: string;
}

// company key -> set of repeated word windows (company-level text)
export type BoilerplateIndex = Map<string, Set<string>>;

// A run of 6 words that appears under 3+ different titles of one company is company text.
const WINDOW = 6;
const MIN_DISTINCT_TITLES = 3;

// "Full-stack" and "Full stack", "Lemon.io" and "lemon.io" become the same key.
function slug(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Token {
  word: string;
  key: string;
}

// "React," and "react" must compare equal; pure punctuation ("-", "|", "•") is dropped.
function tokenize(text: string): Token[] {
  return normalizeText(text)
    .split(' ')
    .map((word) => ({
      word,
      key: word.toLowerCase().replace(/^[^a-z0-9.#+]+|[^a-z0-9#+]+$/g, ''),
    }))
    .filter((t) => t.key.length > 0);
}

function windowAt(tokens: Token[], start: number): string {
  return tokens
    .slice(start, start + WINDOW)
    .map((t) => t.key)
    .join(' ');
}

export function buildBoilerplateIndex(
  jobs: BoilerplateJob[],
): BoilerplateIndex {
  // Only companies with enough different titles can have boilerplate: skip the rest.
  const byCompany = new Map<string, BoilerplateJob[]>();
  for (const job of jobs) {
    const company = slug(job.company);
    if (!company) continue;
    const list = byCompany.get(company) ?? [];
    list.push(job);
    byCompany.set(company, list);
  }

  const index: BoilerplateIndex = new Map();
  for (const [company, group] of byCompany) {
    if (new Set(group.map((j) => slug(j.title))).size < MIN_DISTINCT_TITLES)
      continue;

    const titlesPerWindow = new Map<string, Set<string>>();
    for (const job of group) {
      const title = slug(job.title);
      const tokens = tokenize(job.descriptionText);
      for (let i = 0; i + WINDOW <= tokens.length; i++) {
        const window = windowAt(tokens, i);
        const titles = titlesPerWindow.get(window) ?? new Set<string>();
        titles.add(title);
        titlesPerWindow.set(window, titles);
      }
    }

    const repeated = new Set<string>();
    for (const [window, titles] of titlesPerWindow) {
      if (titles.size >= MIN_DISTINCT_TITLES) repeated.add(window);
    }
    if (repeated.size > 0) index.set(company, repeated);
  }
  return index;
}

export function stripBoilerplate(
  job: { company: string; descriptionText: string },
  index: BoilerplateIndex,
): string {
  const repeated = index.get(slug(job.company));
  if (!repeated) return job.descriptionText;

  const tokens = tokenize(job.descriptionText);
  const drop = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i + WINDOW <= tokens.length; i++) {
    if (repeated.has(windowAt(tokens, i))) {
      for (let j = i; j < i + WINDOW; j++) drop[j] = true;
    }
  }
  return tokens
    .filter((_, i) => !drop[i])
    .map((t) => t.word)
    .join(' ');
}
