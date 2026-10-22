export interface CanonicalSkill {
  id: string;
  name: string;
  aliases: string[];
  caseSensitiveAliases?: string[];
}

export const CORE_SKILL_IDS = new Set<string>([
  'node',
  'typescript',
  'react',
  'next.js',
  'express',
  'postgres',
  'mongodb',
  'prisma',
  'supabase',
  'redis',
  'docker',
  'stripe',
  'openai',
  'n8n',
  'react native',
  'bull',
  'puppeteer',
  'zod',
  'tailwind',
]);

export const GENERIC_SKILL_IDS = new Set<string>([
  'git',
  'html',
  'css',
  'rest',
  'javascript',
  'ci/cd',
]);

export function isGenericSkill(id: string): boolean {
  return GENERIC_SKILL_IDS.has(id);
}

export function isCoreSkill(id: string): boolean {
  return CORE_SKILL_IDS.has(id);
}

/**
 * Normalizes text upfront before any regex or skill matching:
 * - Replaces Unicode dashes and hyphens (U+2010 to U+2015, U+2212) with standard '-'
 * - Replaces non-breaking spaces (U+00A0, U+202F, U+FEFF, etc.) with standard ' '
 * - Collapses newlines to a single space
 * - Collapses repeated whitespace to a single space and trims
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u202F\uFEFF]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SKILLS_DICTIONARY: CanonicalSkill[] = [
  // Core skills (treat nest/nestjs as a Node alias)
  {
    id: 'node',
    name: 'Node.js',
    aliases: [
      'node',
      'node.js',
      'nodejs',
      'node js',
      'nest',
      'nestjs',
      'nest.js',
      'nest js',
    ],
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    aliases: ['typescript'],
    caseSensitiveAliases: ['TS'],
  },
  {
    id: 'react',
    name: 'React',
    aliases: ['react.js', 'reactjs', 'react js'],
    caseSensitiveAliases: ['React'],
  },
  {
    id: 'react native',
    name: 'React Native',
    aliases: ['react native', 'react-native'],
  },
  {
    id: 'next.js',
    name: 'Next.js',
    aliases: ['next.js', 'nextjs', 'next js', 'next 13', 'next 14', 'next 15'],
  },
  {
    id: 'express',
    name: 'Express',
    aliases: ['express.js', 'expressjs', 'express js'],
    caseSensitiveAliases: ['Express'],
  },
  {
    id: 'bull',
    name: 'BullMQ',
    aliases: ['bullmq'],
    caseSensitiveAliases: ['Bull'],
  },
  {
    id: 'rest',
    name: 'REST APIs',
    aliases: ['restful', 'rest api', 'rest apis'],
    caseSensitiveAliases: ['REST'],
  },

  {
    id: 'postgres',
    name: 'PostgreSQL',
    aliases: ['postgres', 'postgresql', 'psql'],
  },
  { id: 'mongodb', name: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { id: 'supabase', name: 'Supabase', aliases: ['supabase'] },
  { id: 'prisma', name: 'Prisma', aliases: ['prisma', 'prisma orm'] },
  { id: 'redis', name: 'Redis', aliases: ['redis'] },
  { id: 'docker', name: 'Docker', aliases: ['docker'] },
  { id: 'stripe', name: 'Stripe', aliases: ['stripe'] },
  {
    id: 'openai',
    name: 'OpenAI / LLMs',
    aliases: ['openai', 'gpt-4', 'gpt', 'chatgpt', 'llm', 'llms'],
  },
  { id: 'n8n', name: 'n8n', aliases: ['n8n', 'n8n workflows'] },

  { id: 'puppeteer', name: 'Puppeteer', aliases: ['puppeteer'] },
  { id: 'zod', name: 'Zod', aliases: ['zod'] },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    aliases: ['tailwind', 'tailwindcss', 'tailwind css', 'tailwind-css'],
  },

  // Generic skills
  {
    id: 'javascript',
    name: 'JavaScript',
    aliases: ['javascript', 'js', 'ecmascript', 'es6', 'es6+'],
  },
  { id: 'git', name: 'Git', aliases: ['git', 'github'] },
  { id: 'html', name: 'HTML', aliases: ['html', 'html5'] },
  { id: 'css', name: 'CSS', aliases: ['css', 'css3', 'sass', 'scss'] },
  {
    id: 'ci/cd',
    name: 'CI/CD',
    aliases: ['ci/cd', 'ci cd', 'ci-cd', 'github actions', 'gitlab ci'],
  },

  // Additional recognized skills / known stacks (for profile extraction)
  { id: 'graphql', name: 'GraphQL', aliases: ['graphql'] },
  { id: 'aws', name: 'AWS', aliases: ['aws', 'amazon web services'] },
  { id: 'gcp', name: 'GCP', aliases: ['gcp', 'google cloud'] },
  { id: 'python', name: 'Python', aliases: ['python', 'python3'] },
  { id: 'django', name: 'Django', aliases: ['django'] },
  { id: 'flask', name: 'Flask', aliases: ['flask'] },
  { id: 'fastapi', name: 'FastAPI', aliases: ['fastapi'] },
  { id: 'vue', name: 'Vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { id: 'angular', name: 'Angular', aliases: ['angular', 'angularjs'] },
  { id: 'svelte', name: 'Svelte', aliases: ['svelte', 'sveltekit'] },
  {
    id: 'testing',
    name: 'Testing',
    aliases: ['jest', 'vitest', 'cypress', 'playwright'],
  },
  { id: 'sql', name: 'SQL', aliases: ['sql', 'sqlite', 'mysql'] },
  { id: 'java', name: 'Java', aliases: ['java', 'jvm'] },
  {
    id: 'spring',
    name: 'Spring',
    aliases: ['spring', 'springboot', 'spring boot'],
  },
  { id: 'kotlin', name: 'Kotlin', aliases: ['kotlin'] },
  { id: 'swift', name: 'Swift', aliases: ['swift', 'swiftui'] },
  { id: 'ruby', name: 'Ruby', aliases: ['ruby'] },
  { id: 'rails', name: 'Rails', aliases: ['rails', 'ruby on rails'] },
  { id: 'php', name: 'PHP', aliases: ['php'] },
  { id: 'laravel', name: 'Laravel', aliases: ['laravel'] },
  { id: 'symfony', name: 'Symfony', aliases: ['symfony'] },
  { id: '.net', name: '.NET', aliases: ['.net', 'dotnet', 'asp.net'] },
  { id: 'c#', name: 'C#', aliases: ['c#', 'csharp', 'c-sharp'] },
  { id: 'c++', name: 'C++', aliases: ['c++', 'cxx'] },
  { id: 'golang', name: 'Golang', aliases: ['golang', 'go language'] },
  { id: 'rust', name: 'Rust', aliases: ['rust'] },
  { id: 'scala', name: 'Scala', aliases: ['scala'] },
  { id: 'elixir', name: 'Elixir', aliases: ['elixir'] },
  { id: 'flutter', name: 'Flutter', aliases: ['flutter'] },
  {
    id: 'solidity',
    name: 'Solidity',
    aliases: ['solidity', 'web3', 'smart contracts'],
  },
  { id: 'android', name: 'Android', aliases: ['android'] },
  { id: 'ios', name: 'iOS', aliases: ['ios'] },
  {
    id: 'embedded',
    name: 'Embedded',
    aliases: ['embedded', 'firmware', 'microcontroller', 'fpga'],
  },
];

export interface KnownStack {
  id: string;
  name: string;
  patterns: string[];
}

export const KNOWN_STACKS: KnownStack[] = [
  { id: 'python', name: 'Python', patterns: ['python', 'python3'] },
  { id: 'django', name: 'Django', patterns: ['django'] },
  { id: 'flask', name: 'Flask', patterns: ['flask'] },
  { id: 'fastapi', name: 'FastAPI', patterns: ['fastapi'] },
  { id: 'java', name: 'Java', patterns: ['java', 'jvm'] }, // word boundary ensures no match on javascript
  {
    id: 'spring',
    name: 'Spring',
    patterns: ['spring', 'springboot', 'spring boot'],
  },
  { id: 'kotlin', name: 'Kotlin', patterns: ['kotlin'] },
  { id: 'swift', name: 'Swift', patterns: ['swift', 'swiftui'] },
  { id: 'ruby', name: 'Ruby', patterns: ['ruby'] },
  { id: 'rails', name: 'Rails', patterns: ['rails', 'ruby on rails'] },
  { id: 'php', name: 'PHP', patterns: ['php'] },
  { id: 'laravel', name: 'Laravel', patterns: ['laravel'] },
  { id: 'symfony', name: 'Symfony', patterns: ['symfony'] },
  { id: '.net', name: '.NET', patterns: ['.net', 'dotnet', 'asp.net'] },
  { id: 'c#', name: 'C#', patterns: ['c#', 'csharp', 'c-sharp'] },
  { id: 'c++', name: 'C++', patterns: ['c++', 'cxx'] },
  { id: 'golang', name: 'Golang', patterns: ['golang', 'go language'] }, // NEVER 'go' alone
  { id: 'rust', name: 'Rust', patterns: ['rust'] },
  { id: 'scala', name: 'Scala', patterns: ['scala'] },
  { id: 'elixir', name: 'Elixir', patterns: ['elixir'] },
  { id: 'vue', name: 'Vue', patterns: ['vue', 'vue.js', 'vuejs'] },
  { id: 'angular', name: 'Angular', patterns: ['angular', 'angularjs'] },
  { id: 'svelte', name: 'Svelte', patterns: ['svelte', 'sveltekit'] },
  { id: 'flutter', name: 'Flutter', patterns: ['flutter'] },
  {
    id: 'solidity',
    name: 'Solidity',
    patterns: ['solidity', 'web3', 'smart contracts'],
  },
  { id: 'android', name: 'Android', patterns: ['android'] },
  { id: 'ios', name: 'iOS', patterns: ['ios'] },
  {
    id: 'embedded',
    name: 'Embedded',
    patterns: ['embedded', 'firmware', 'microcontroller', 'fpga'],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a regex pattern with word-boundary awareness, correctly handling
 * special characters such as '.', '#', '+', and '/'.
 */
export function buildSkillRegex(alias: string, caseSensitive = false): RegExp {
  const trimmed = alias.trim();
  const lower = trimmed.toLowerCase();
  const escaped = escapeRegExp(caseSensitive ? trimmed : lower);

  const prefix = /^\w/.test(lower)
    ? '(?<=^|[^a-zA-Z0-9_])'
    : '(?<=^|[\\s/.,;:()\\[\\]{}<>"\']|\\b)';
  let suffix = /\w$/.test(lower)
    ? '(?=$|[^a-zA-Z0-9_])'
    : '(?=$|[\\s/.,;:()\\[\\]{}<>"\']|\\b)';

  // "React Native" and "React-Native" are a different skill, not React.
  // Letter classes (not /i) because case-sensitive regexes must still see "Native".
  if (lower === 'react' || lower === 'react.js' || lower === 'reactjs') {
    suffix = `(?=$|[^a-zA-Z0-9_])(?![\\s-]*[Nn][Aa][Tt][Ii][Vv][Ee]\\b)`;
  }

  return new RegExp(`${prefix}${escaped}${suffix}`, caseSensitive ? '' : 'i');
}

interface CompiledSkill {
  id: string;
  name: string;
  regexes: RegExp[];
}

function compileAliases(skill: CanonicalSkill): RegExp[] {
  const loose = skill.aliases.map((alias) => buildSkillRegex(alias));
  const strict = (skill.caseSensitiveAliases ?? []).flatMap((alias) =>
    Array.from(new Set([alias, alias.toUpperCase()]), (form) =>
      buildSkillRegex(form, true),
    ),
  );
  return [...loose, ...strict];
}

const COMPILED_SKILLS: CompiledSkill[] = SKILLS_DICTIONARY.map((skill) => ({
  id: skill.id,
  name: skill.name,
  regexes: compileAliases(skill),
}));

export interface CompiledKnownStack {
  id: string;
  name: string;
  regexes: RegExp[];
}

export const COMPILED_KNOWN_STACKS: CompiledKnownStack[] = KNOWN_STACKS.map(
  (stack) => ({
    id: stack.id,
    name: stack.name,
    regexes: stack.patterns.map((pattern) => buildSkillRegex(pattern)),
  }),
);

/**
 * Extracts all canonical skill IDs present in a text string.
 */
export function extractCanonicalSkills(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeText(text);
  const matched: string[] = [];
  for (const skill of COMPILED_SKILLS) {
    if (skill.regexes.some((re) => re.test(normalized))) {
      matched.push(skill.id);
    }
  }
  return matched;
}
