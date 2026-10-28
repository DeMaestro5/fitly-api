export const EMAIL_MIN_WORDS = 70;
export const EMAIL_MAX_WORDS = 150;
export const SUBJECT_MAX_CHARS = 90;

const FILLER_PHRASES = [
  'i am writing to',
  "i'm writing to",
  'i hope this email finds you',
  'i am excited',
  "i'm excited",
  'i am thrilled',
  'passionate',
  'perfect fit',
  'dream job',
];

export interface DraftParts {
  subject: string;
  body: string;
}

export interface Signature {
  name: string;
  email: string;
  links: string[];
}

export interface EmailCheckInput {
  draft: DraftParts;
  resumeText: string; // plain text of the master resume
  vocabulary: string[]; // every tech term Fitly knows
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegex(term)}($|[^a-z0-9])`,
    'i',
  );
  return pattern.test(haystack);
}

export function checkEmailDraft(input: EmailCheckInput): string[] {
  const { draft, resumeText, vocabulary } = input;
  const problems: string[] = [];
  const body = draft.body.trim();
  const subject = draft.subject.trim();
  const lowerBody = body.toLowerCase();

  if (!subject) problems.push('Subject is empty');
  if (subject.length > SUBJECT_MAX_CHARS) {
    problems.push(`Subject is longer than ${SUBJECT_MAX_CHARS} characters`);
  }

  const words = countWords(body);
  if (words < EMAIL_MIN_WORDS)
    problems.push(`Body has ${words} words; write at least ${EMAIL_MIN_WORDS}`);
  if (words > EMAIL_MAX_WORDS)
    problems.push(`Body has ${words} words; keep it under ${EMAIL_MAX_WORDS}`);

  if (/[[\]{}<>]/.test(body) || /[[\]{}<>]/.test(subject)) {
    problems.push('Contains placeholder brackets; write final text only');
  }

  if (/^(hi|hello|dear|hey)\b/.test(lowerBody)) {
    problems.push('Do not write a greeting; it is added separately');
  }
  if (/(regards|sincerely|best|thanks|cheers),?\s*$/.test(lowerBody)) {
    problems.push('Do not write a sign-off; it is added separately');
  }

  for (const phrase of FILLER_PHRASES) {
    if (lowerBody.includes(phrase))
      problems.push(`Remove filler phrase "${phrase}"`);
  }

  // Facts: every technology named must exist in the master resume.
  const unknownTech = vocabulary
    .filter((term) => term.length >= 3)
    .filter(
      (term) => containsTerm(body, term) && !containsTerm(resumeText, term),
    );
  if (unknownTech.length > 0) {
    problems.push(
      `Mentions technologies not in the resume: ${unknownTech.join(', ')}`,
    );
  }

  // Facts: every number must exist in the master resume (years, percentages).
  const numbers = body.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const unknownNumbers = numbers.filter((n) => !containsTerm(resumeText, n));
  if (unknownNumbers.length > 0) {
    problems.push(
      `Uses numbers not in the resume: ${[...new Set(unknownNumbers)].join(', ')}`,
    );
  }

  return problems;
}

export function assembleEmail(
  draft: DraftParts,
  signature: Signature,
): DraftParts {
  const lines = [
    'Hello,',
    '',
    draft.body.trim(),
    '',
    'Best regards,',
    signature.name,
    signature.email,
    ...signature.links,
  ];
  return { subject: draft.subject.trim(), body: lines.join('\n') };
}
