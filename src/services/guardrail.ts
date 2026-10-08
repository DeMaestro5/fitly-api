import type { Tailorable } from '../schemas/resume.schema';
import { normalizeText } from '../utils/normalize-text';

export interface Finding {
  severity: 'error' | 'warning';
  rule: 'ids' | 'skills' | 'numbers' | 'role-skill' | 'borrowed-terms';
  path: string;
  message: string;
}

const error = (
  rule: Finding['rule'],
  path: string,
  message: string
): Finding => ({
  severity: 'error',
  rule,
  path,
  message,
});
const warning = (
  rule: Finding['rule'],
  path: string,
  message: string
): Finding => ({
  severity: 'warning',
  rule,
  path,
  message,
});

/* ----------------------------- helpers ----------------------------- */

const WORD_TO_NUMBER: Record<string, string> = {
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
};

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'across',
  'using',
  'via',
  'has',
  'have',
  'are',
  'was',
  'were',
  'been',
  'its',
  'their',
  'your',
  'our',
  'you',
  'all',
  'each',
  'per',
  'such',
  'than',
  'then',
  'also',
  'can',
  'will',
  'not',
]);

const GENERIC = new Set([
  'experience',
  'strong',
  'team',
  'teams',
  'work',
  'working',
  'build',
  'building',
  'built',
  'ability',
  'skills',
  'skill',
  'years',
  'year',
  'senior',
  'role',
  'join',
  'looking',
  'including',
  'required',
  'requirements',
  'nice',
  'clear',
  'written',
  'communication',
  'knowledge',
  'solutions',
  'systems',
  'products',
  'product',
  'features',
  'feature',
  'real',
  'time',
  'end',
  'full',
  'stack',
  'remote',
  'design',
  'designed',
  'develop',
  'developed',
  'deliver',
  'delivered',
  'create',
  'created',
  'implement',
  'implemented',
  'manage',
  'managed',
  'maintain',
  'proven',
  'professional',
]);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mentions = (text: string, term: string): boolean =>
  new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, 'i').test(text);

function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) found.add(match[0]);
  for (const match of text.toLowerCase().matchAll(/[a-z]+/g)) {
    const digit = WORD_TO_NUMBER[match[0]];
    if (digit) found.add(digit);
  }
  return found;
}

function stem(word: string): string {
  let w = word.replace(/(?:ing|ed|ly)$/, '');
  if (!w.endsWith('ss')) w = w.replace(/(?:es|s)$/, '');
  return w.replace(/e$/, '');
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) =>
      w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w) && !GENERIC.has(w)
  );
}

const stemSet = (text: string) => new Set(words(text).map(stem));

function borrowedTerms(
  text: string,
  scope: string,
  jdStems: Set<string>
): string[] {
  const scopeStems = stemSet(scope);
  const found = new Set<string>();
  for (const word of words(text)) {
    const s = stem(word);
    if (!scopeStems.has(s) && jdStems.has(s)) found.add(word);
  }
  return [...found].slice(0, 8);
}

const allText = (t: Tailorable): string =>
  [
    t.headline,
    t.summary,
    ...t.experience.flatMap((r) => r.bullets.map((b) => b.text)),
    ...t.projects.map((p) => p.description),
    ...t.skills.flatMap((g) => g.items),
  ]
    .filter(Boolean)
    .join(' ');

/* ------------------------------ checks ------------------------------ */

function compareIds(
  kind: string,
  originalIds: string[],
  tailoredIds: string[]
): Finding[] {
  const out: Finding[] = [];
  if (tailoredIds.length !== new Set(tailoredIds).size) {
    out.push(error('ids', kind, 'Duplicate ids in the output'));
  }
  for (const id of tailoredIds) {
    if (!originalIds.includes(id))
      out.push(
        error('ids', `${kind}.${id}`, 'Unknown id, not in the master resume')
      );
  }
  for (const id of originalIds) {
    if (!tailoredIds.includes(id))
      out.push(error('ids', `${kind}.${id}`, 'Missing from the output'));
  }
  return out;
}

function checkSkills(original: Tailorable, tailored: Tailorable): Finding[] {
  const out: Finding[] = [];
  const groups = new Map(original.skills.map((g) => [g.id, g]));
  for (const group of tailored.skills) {
    const source = groups.get(group.id);
    if (!source) continue; // already reported by compareIds
    if (normalizeText(group.group) !== normalizeText(source.group)) {
      out.push(error('skills', `skills.${group.id}`, 'Group name was changed'));
    }
    const allowed = new Set(
      source.items.map((i) => normalizeText(i).toLowerCase())
    );
    for (const item of group.items) {
      if (!allowed.has(normalizeText(item).toLowerCase())) {
        out.push(
          error(
            'skills',
            `skills.${group.id}`,
            `New skill not in the master resume: "${item}"`
          )
        );
      }
    }
  }
  return out;
}

interface TextContext {
  vocabulary: string[]; // every skill name in the master resume
  jdStems: Set<string>;
}

function checkText(
  path: string,
  text: string,
  scope: string,
  ctx: TextContext
): Finding[] {
  const out: Finding[] = [];

  const allowedNumbers = numbersIn(scope);
  for (const n of numbersIn(text)) {
    if (!allowedNumbers.has(n))
      out.push(
        error('numbers', path, `Number "${n}" is not in the original text`)
      );
  }

  for (const term of ctx.vocabulary) {
    if (mentions(text, term) && !mentions(scope, term)) {
      out.push(
        error(
          'role-skill',
          path,
          `Mentions "${term}", which the original text for this entry does not`
        )
      );
    }
  }

  const borrowed = borrowedTerms(text, scope, ctx.jdStems);
  if (borrowed.length > 0) {
    out.push(
      warning(
        'borrowed-terms',
        path,
        `Wording borrowed from the job description: ${borrowed.join(', ')}`
      )
    );
  }
  return out;
}

/* ------------------------------ public ------------------------------ */

export function checkTailored(
  original: Tailorable,
  tailored: Tailorable,
  jobDescription: string
): Finding[] {
  const findings: Finding[] = [
    ...compareIds(
      'experience',
      original.experience.map((r) => r.id),
      tailored.experience.map((r) => r.id)
    ),
    ...compareIds(
      'projects',
      original.projects.map((p) => p.id),
      tailored.projects.map((p) => p.id)
    ),
    ...compareIds(
      'skills',
      original.skills.map((g) => g.id),
      tailored.skills.map((g) => g.id)
    ),
    ...checkSkills(original, tailored),
  ];

  const ctx: TextContext = {
    vocabulary: [
      ...new Set(
        original.skills
          .flatMap((g) => g.items)
          .map((item) => item.replace(/\s*\(.*?\)/g, '').trim())
          .filter((item) => item.length >= 2)
      ),
    ],
    jdStems: stemSet(jobDescription),
  };

  const wholeOriginal = allText(original);
  if (tailored.headline)
    findings.push(
      ...checkText('headline', tailored.headline, wholeOriginal, ctx)
    );
  if (tailored.summary)
    findings.push(
      ...checkText('summary', tailored.summary, wholeOriginal, ctx)
    );

  const originalRoles = new Map(original.experience.map((r) => [r.id, r]));
  for (const role of tailored.experience) {
    const source = originalRoles.get(role.id);
    if (!source) continue;
    const allowedBulletIds = new Set(source.bullets.map((b) => b.id));
    const scope = source.bullets.map((b) => b.text).join(' ');
    for (const bullet of role.bullets) {
      const path = `experience.${role.id}.${bullet.id}`;
      if (!allowedBulletIds.has(bullet.id)) {
        findings.push(
          error(
            'ids',
            path,
            'Bullet does not belong to this role in the master resume'
          )
        );
        continue;
      }
      findings.push(...checkText(path, bullet.text, scope, ctx));
    }
  }

  const originalProjects = new Map(original.projects.map((p) => [p.id, p]));
  for (const project of tailored.projects) {
    const source = originalProjects.get(project.id);
    if (source)
      findings.push(
        ...checkText(
          `projects.${project.id}`,
          project.description,
          source.description,
          ctx
        )
      );
  }

  return findings;
}
