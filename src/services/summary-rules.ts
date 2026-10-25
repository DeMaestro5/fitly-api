import type { MasterResume } from '../schemas/resume.schema';
import type { Focus, JobSignals } from './job-signals';
import { extractCanonicalSkills } from './skills-dictionary';

export const MIN_SENTENCES = 3;
export const MAX_SENTENCES = 5;
export const MIN_WORDS = 35;
export const MAX_WORDS = 95;
export const MAX_HEADLINE_WORDS = 14;

export interface SummaryFacts {
  vocabulary: Set<string>; // every word that appears anywhere in the master resume
  skillIds: Set<string>; // known technologies the master resume mentions
  yearsClaim: string | null; // "4" from "4+ years"
  founderOf: string | null; // "Novba"
}

/* ---------------------------- text helpers ---------------------------- */

// Only collapses whitespace, so dashes and quotes in the original are kept exactly.
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TOKEN = /[A-Za-z0-9][A-Za-z0-9.+#]*/g;
const tokensOf = (text: string): string[] => text.match(TOKEN) ?? [];
const cleanToken = (token: string): string => token.replace(/\.+$/, ''); // "Node.js." -> "Node.js"

function key(token: string): string {
  const lower = cleanToken(token).toLowerCase();
  return /^\d/.test(lower) ? lower.replace(/\+$/, '') : lower; // "4+" -> "4", but keep "c++"
}

export const tokenKeys = (text: string): string[] => tokensOf(text).map(key);

/* ------------------------------- facts ------------------------------- */

export function factsFromTexts(
  texts: string[],
  summary: string,
  founderOf: string | null,
): SummaryFacts {
  const years = /(\d+)\+?\s*years?/i.exec(summary);
  return {
    vocabulary: new Set(texts.flatMap(tokenKeys)),
    skillIds: new Set(texts.flatMap((t) => extractCanonicalSkills(t))),
    yearsClaim: years ? years[1] : null,
    founderOf,
  };
}

export function buildFacts(master: MasterResume): SummaryFacts {
  const { tailorable, locked } = master;
  const texts = [
    tailorable.headline ?? '',
    tailorable.summary ?? '',
    ...tailorable.skills.flatMap((g) => [g.group, ...g.items]),
    ...tailorable.experience.flatMap((e) => e.bullets.map((b) => b.text)),
    ...tailorable.projects.map((p) => p.description),
    ...locked.experience.flatMap((r) => [
      r.title,
      r.company,
      r.location,
      r.tagline ?? '',
    ]),
    ...locked.projects.flatMap((p) => [p.name, ...p.technologies]),
    ...locked.education.flatMap((e) => [e.institution, e.area]),
    locked.basics.location,
  ];
  const founder = locked.experience.find((r) => /founder/i.test(r.title));
  return factsFromTexts(
    texts,
    tailorable.summary ?? '',
    founder?.company ?? null,
  );
}

/* ----------------------------- validation ----------------------------- */

// Generic words that are fine to use even though they are capitalised or abbreviations.
const SAFE_TERMS = new Set([
  'ui',
  'uis',
  'ux',
  'api',
  'apis',
  'ci',
  'cd',
  'sdk',
  'sql',
  'nosql',
  'html',
  'css',
  'json',
  'http',
  'b2b',
  'b2c',
  'rest',
]);

// Claiming a level you never held is the most damaging kind of invented fact.
const SENIORITY = new Set([
  'senior',
  'sr',
  'lead',
  'principal',
  'staff',
  'junior',
  'jr',
  'mid',
  'expert',
  'specialist',
  'architect',
  'director',
  'manager',
  'head',
]);

// The skills dictionary treats NestJS as a Node alias (right for scoring jobs, too generous
// for a claim about yourself), so it gets its own check.
const NEST = /\bnest(?:\.?js)?\b/gi;

function collectUnsupported(
  text: string,
  facts: SummaryFacts,
  skipSentenceStarts: boolean,
): string[] {
  const found = new Map<string, string>();
  const sentences = skipSentenceStarts ? splitSentences(text) : [text];

  for (const sentence of sentences) {
    tokensOf(sentence).forEach((token, index) => {
      const clean = cleanToken(token);
      const k = key(token);

      if (SENIORITY.has(k) && !facts.vocabulary.has(k)) {
        found.set(k, clean);
        return;
      }
      if (skipSentenceStarts && index === 0) return; // sentences start with a capital letter anyway

      const termLike = /^[A-Z]/.test(clean) || /[0-9.+#]/.test(clean);
      if (!termLike || SAFE_TERMS.has(k) || facts.vocabulary.has(k)) return;

      // Aliases of a technology the resume has ("Postgres", "LLMs", "NodeJS") are fine.
      const ids = extractCanonicalSkills(clean);
      if (ids.length > 0 && ids.every((id) => facts.skillIds.has(id))) return;

      found.set(k, clean);
    });
  }

  for (const match of text.matchAll(NEST)) {
    if (!facts.vocabulary.has(key(match[0])))
      found.set(key(match[0]), match[0]);
  }
  // Catches known technologies even when they are written in lower case.
  for (const id of extractCanonicalSkills(text)) {
    if (!facts.skillIds.has(id) && !found.has(id)) found.set(id, id);
  }
  return [...found.values()];
}

const wordCount = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

// Filler the prompt forbids. Allowed only if the resume itself already uses the word.
const FILLER = new Set([
  'proven',
  'expertise',
  'diverse',
  'seasoned',
  'passionate',
  'innovative',
  'extensive',
  'exceptional',
]);

function fillerWords(text: string, facts: SummaryFacts): string[] {
  const found = new Set<string>();
  for (const token of tokensOf(text)) {
    const k = key(token);
    if (FILLER.has(k) && !facts.vocabulary.has(k)) found.add(k);
  }
  return [...found];
}

export function validateSummary(
  summary: string,
  facts: SummaryFacts,
): string[] {
  const problems: string[] = [];
  const sentences = splitSentences(summary).length;
  const words = wordCount(summary);

  if (sentences < MIN_SENTENCES || sentences > MAX_SENTENCES) {
    problems.push(
      `Use ${MIN_SENTENCES} to ${MAX_SENTENCES} sentences (you wrote ${sentences}).`,
    );
  }
  if (words < MIN_WORDS || words > MAX_WORDS) {
    problems.push(
      `Use ${MIN_WORDS} to ${MAX_WORDS} words (you wrote ${words}).`,
    );
  }
  if (
    facts.yearsClaim &&
    !new RegExp(`\\b${facts.yearsClaim}\\+?\\s*years?\\b`, 'i').test(summary)
  ) {
    problems.push(
      `Keep the experience claim exactly as in the original: "${facts.yearsClaim}+ years".`,
    );
  }
  if (
    facts.founderOf &&
    !summary.toLowerCase().includes(facts.founderOf.toLowerCase())
  ) {
    problems.push(`Mention that the candidate founded ${facts.founderOf}.`);
  }
  if (/\b(I|my|me|I'm|I've)\b/.test(summary)) {
    problems.push('Do not use first person (I, my, me).');
  }
  const unsupported = collectUnsupported(summary, facts, true);
  if (unsupported.length > 0) {
    problems.push(
      `These are not in the candidate's resume, remove them: ${unsupported.slice(0, 8).join(', ')}.`,
    );
  }

  const filler = fillerWords(summary, facts);
  if (filler.length > 0) {
    problems.push(
      `Remove filler wording that is not in the candidate's resume: ${filler.join(', ')}.`,
    );
  }
  return problems;
}

export function validateHeadline(
  headline: string,
  facts: SummaryFacts,
): string[] {
  const problems: string[] = [];
  if (!headline.trim() || /[\r\n]/.test(headline)) {
    problems.push('The headline must be one non-empty line.');
  }
  if (wordCount(headline) > MAX_HEADLINE_WORDS) {
    problems.push(`The headline can have at most ${MAX_HEADLINE_WORDS} words.`);
  }
  const unsupported = collectUnsupported(headline, facts, false);
  if (unsupported.length > 0) {
    problems.push(
      `These are not in the candidate's resume, remove them: ${unsupported.slice(0, 8).join(', ')}.`,
    );
  }
  return problems;
}

/* ------------------------------ fallback ------------------------------ */

const FOCUS_WORDS: Record<Focus, RegExp | null> = {
  frontend:
    /\b(react|next\.js|tailwind|ui|uis|css|frontend|front-end|interface|component)\b/i,
  backend:
    /\b(node|express|postgres|postgresql|mongodb|redis|api|apis|queue|database|backend|back-end|server)\b/i,
  fullstack: null,
};
const AI_WORDS = /\b(ai|openai|gpt|llm|automation|n8n|intelligent)\b/i;

function relevance(sentence: string, signals: JobSignals): number {
  let score = extractCanonicalSkills(sentence).filter((id) =>
    signals.skills.has(id),
  ).length;
  if (FOCUS_WORDS[signals.focus]?.test(sentence)) score += 1;
  if (signals.aiHeavy && AI_WORDS.test(sentence)) score += 1;
  return score;
}

// The safe fallback: only the candidate's own sentences, reordered and trimmed for this job.
// The first sentence (who they are, years) and the founder sentence always stay.
export function reorderOriginalSummary(
  summary: string,
  signals: JobSignals,
  facts: SummaryFacts,
): string {
  const sentences = splitSentences(summary);
  if (sentences.length <= MIN_SENTENCES) return sentences.join(' ');

  const founder = facts.founderOf?.toLowerCase() ?? null;
  const items = sentences.map((text, index) => ({
    text,
    index,
    score: relevance(text, signals),
    isFounder: founder !== null && text.toLowerCase().includes(founder),
  }));

  const first = items[0];
  const founderItem = items.find((item) => item.isFounder && item.index !== 0);
  const pinned = founderItem ? [first, founderItem] : [first];
  const rest = items
    .filter((item) => !pinned.includes(item))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  // Keep at least MIN_SENTENCES; beyond that keep only sentences that matter for this job.
  const needed = Math.max(0, MIN_SENTENCES - pinned.length);
  const kept = rest.filter((item, i) => i < needed || item.score > 0);

  return [...pinned, ...kept].map((item) => item.text).join(' ');
}
