import type { PreparedPosting } from './jobPosting-service';
import { extractCanonicalSkills, normalizeText } from './skills-dictionary';

export type Focus = 'fullstack' | 'backend' | 'frontend';

export interface JobSignals {
  focus: Focus;
  aiHeavy: boolean;
  skills: Set<string>; // canonical skill ids the job mentions (title + requirements)
}

type PostingInput = Pick<PreparedPosting, 'title' | 'requirements' | 'text'>;

const FULLSTACK_TITLE = /\bfull[\s-]?stack\b/i;
const FRONTEND_TITLE =
  /\b(front[\s-]?end|ui\s+(engineer|developer)|react(\.js)?\s+(engineer|developer))\b/i;
const BACKEND_TITLE =
  /\b(back[\s-]?end|server[\s-]?side|api\s+(engineer|developer)|node(\.js)?\s+(engineer|developer))\b/i;
const AI_TERMS =
  /\b(ai|llm|llms|genai|generative ai|machine learning|ml|openai|gpt|rag|agentic)\b/i;

const FRONTEND_IDS = new Set([
  'react',
  'next.js',
  'tailwind',
  'css',
  'html',
  'vue',
  'angular',
  'svelte',
]);
const BACKEND_IDS = new Set([
  'node',
  'express',
  'postgres',
  'mongodb',
  'redis',
  'prisma',
  'supabase',
  'docker',
  'rest',
  'bull',
  'python',
  'django',
  'flask',
  'fastapi',
  'sql',
  'java',
  'spring',
  'golang',
  'rails',
  'php',
  'laravel',
]);

// Used only when the title does not say (e.g. "Software Engineer"): count the technologies.
function focusFromSkills(skills: Set<string>): Focus {
  let front = 0;
  let back = 0;
  for (const id of skills) {
    if (FRONTEND_IDS.has(id)) front += 1;
    if (BACKEND_IDS.has(id)) back += 1;
  }
  if (front >= 2 && front >= back * 2) return 'frontend';
  if (back >= 2 && back >= front * 2) return 'backend';
  return 'fullstack';
}

export function getJobSignals(posting: PostingInput): JobSignals {
  const title = normalizeText(posting.title ?? '');
  const items = posting.requirements
    ? [...posting.requirements.required, ...posting.requirements.preferred]
    : [];

  // If the posting analysis failed there is no requirements list, so read the whole text.
  const source =
    items.length > 0
      ? `${title} , ${items.join(' , ')}`
      : `${title} , ${posting.text}`;
  const skills = new Set(extractCanonicalSkills(source));

  let focus: Focus;
  if (FULLSTACK_TITLE.test(title)) focus = 'fullstack';
  else if (FRONTEND_TITLE.test(title)) focus = 'frontend';
  else if (BACKEND_TITLE.test(title)) focus = 'backend';
  else focus = focusFromSkills(skills);

  const aiHeavy =
    AI_TERMS.test(title) ||
    items.filter((item) => AI_TERMS.test(item)).length >= 2;

  return { focus, aiHeavy, skills };
}
