import type { MasterResume } from '../schemas/resume.schema';
import type { Requirements } from '../schemas/requirements';
import { mentions } from './guardrail';

const ALIASES: Record<string, string> = {
  postgres: 'postgresql',
  mongo: 'mongodb',
  k8s: 'kubernetes',
  golang: 'go',
  js: 'javascript',
  ts: 'typescript',
  reactjs: 'react',
  nodejs: 'node',
  nextjs: 'next',
  expressjs: 'express',
  vuejs: 'vue',
  rest: 'restapis',
  restfulapis: 'restapis',
  restful: 'restapis',
};

const key = (term: string): string => {
  const base = term
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9+#]/g, '');
  return ALIASES[base] ?? base;
};

export interface TermCoverage {
  matched: string[];
  missing: string[];
}

export interface GapsReport {
  required: TermCoverage;
  preferred: TermCoverage;
  coverage: number | null; // % of required terms the master resume can honestly claim
}

function vocabularyKeys(master: MasterResume): Set<string> {
  const items = [
    ...master.tailorable.skills.flatMap((g) => g.items),
    ...master.locked.projects.flatMap((p) => p.technologies),
  ];
  const keys = new Set<string>();
  for (const item of items) {
    const inner = [...item.matchAll(/\((.*?)\)/g)].flatMap((m) =>
      m[1].split(',')
    );
    const pieces = item.replace(/\(.*?\)/g, '').split(/[/,]/);
    for (const part of [item, ...pieces, ...inner]) {
      const k = key(part);
      if (k) keys.add(k);
    }
  }
  return keys;
}

function evidenceText(master: MasterResume): string {
  const t = master.tailorable;
  return [
    t.headline,
    t.summary,
    ...t.experience.flatMap((r) => r.bullets.map((b) => b.text)),
    ...t.projects.map((p) => p.description),
  ]
    .filter(Boolean)
    .join(' ');
}

export function computeGaps(
  requirements: Requirements,
  master: MasterResume
): GapsReport {
  const keys = vocabularyKeys(master);
  const text = evidenceText(master);

  // Short terms ("Go", "AWS") are matched against skills only, to avoid false hits in prose
  const isCovered = (term: string): boolean =>
    keys.has(key(term)) ||
    (term.replace(/[^a-z]/gi, '').length >= 4 && mentions(text, term));

  const split = (terms: string[]): TermCoverage => ({
    matched: terms.filter(isCovered),
    missing: terms.filter((t) => !isCovered(t)),
  });

  const required = split(requirements.required);
  return {
    required,
    preferred: split(requirements.preferred),
    coverage:
      requirements.required.length > 0
        ? Math.round(
            (required.matched.length / requirements.required.length) * 100
          )
        : null,
  };
}
