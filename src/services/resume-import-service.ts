import { MasterResumeSchema } from '../schemas/resume.schema';
import {
  ExtractedResumeSchema,
  type ExtractedResume,
} from '../schemas/resume-import.schema';
import { AppError } from '../utils/AppError';
import type { Complete } from './groq-complete';
import { extractPdfText } from './pdf-text';

export interface ImportIssue {
  path: string;
  message: string;
}

export interface ImportResult {
  /** Shaped like a master resume, but may be incomplete: the person reviews it. */
  draft: Record<string, unknown>;
  /** What MasterResumeSchema would reject today, so the screen can point at it. */
  issues: ImportIssue[];
  /** Values the model gave that cannot be found in the PDF text. */
  warnings: string[];
}

const MAX_TEXT_LENGTH = 30_000;

const SYSTEM_PROMPT = `You convert the text of a resume into JSON.

Rules:
- Copy wording exactly as written. Never invent, infer, translate, shorten or improve anything.
- Use null for anything the resume does not state.
- Return one JSON object and nothing else.
- URLs must be copied from the HYPERLINKS list or from the text, never made up.
- Dates: "YYYY-MM" when the month is known, "YYYY" when only the year is known, "present" for a current role.
- Bullets: one string per bullet, without the bullet symbol, with wrapped lines joined into one line.
- Skills: keep the groups as the resume shows them. If the resume has one flat list, use a single group named "Skills".
- tagline: the one-line description of the company or role under a job title, when there is one.
- Projects: "technologies" are the tools listed for the project, "description" is its text.

Shape:
{
  "basics": { "fullName": string, "email": string, "phone": string, "location": string },
  "links": { "github": string, "linkedin": string, "portfolio": string, "other": [{ "label": string, "url": string }] },
  "headline": string,
  "summary": string,
  "education": [{ "institution": string, "area": string, "qualification": string, "location": string, "endDate": string }],
  "experience": [{ "title": string, "company": string, "location": string, "startDate": string, "endDate": string, "tagline": string, "url": string, "bullets": [string] }],
  "projects": [{ "name": string, "technologies": [string], "url": string, "description": string }],
  "skills": [{ "group": string, "items": [string] }],
  "hobbies": [string],
  "certifications": [{ "name": string, "issuer": string, "date": string, "url": string }],
  "languages": [{ "language": string, "proficiency": string }],
  "awards": [{ "title": string, "issuer": string, "date": string }]
}`;

/* ----------------------------- helpers ----------------------------- */

const squash = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const bare = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (/^(present|current|now|ongoing|today)$/.test(v)) return 'present';

  let match = /^(\d{4})-(\d{1,2})/.exec(v);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;

  match = /^(\d{1,2})[/.-](\d{4})$/.exec(v);
  if (match) return `${match[2]}-${match[1].padStart(2, '0')}`;

  match = /^([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(v);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (match && month >= 0)
    return `${match[2]}-${String(month + 1).padStart(2, '0')}`;

  if (/^\d{4}$/.test(v)) return v;
  return value.trim();
}

function findLinks(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g))
    found.add(match[1]);
  for (const match of text.matchAll(/https?:\/\/[^\s)\]|,]+/g))
    found.add(match[0]);
  return [...found];
}

function findEmail(text: string): string | undefined {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0];
}

function asUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const clean = <T extends Record<string, unknown>>(object: T): T =>
  Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) =>
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
    )
  ) as T;

/* ------------------------------ draft ------------------------------ */

function toDraft(extracted: ExtractedResume, text: string, links: string[]) {
  const warnings: string[] = [];
  const haystack = squash(text);
  const check = (label: string, value?: string) => {
    if (value && !haystack.includes(squash(value)))
      warnings.push(
        `${label} "${value}" was not found in the PDF text. Check it.`
      );
  };
  const checkUrl = (label: string, value?: string) => {
    if (!value) return;
    const known = links.some(
      (link) => squash(bare(link)) === squash(bare(value))
    );
    if (!known && !haystack.includes(squash(bare(value))))
      warnings.push(`${label} "${value}" was not found in the PDF. Check it.`);
  };

  // The email is locked and a typo would be costly, so the text itself wins.
  const email =
    extracted.basics.email && haystack.includes(squash(extracted.basics.email))
      ? extracted.basics.email
      : findEmail(text) ?? extracted.basics.email;
  check('Name', extracted.basics.fullName);
  if (extracted.basics.phone) {
    const digits = text.replace(/\D/g, '');
    if (!digits.includes(extracted.basics.phone.replace(/\D/g, '')))
      warnings.push(
        `Phone "${extracted.basics.phone}" was not found in the PDF text. Check it.`
      );
  }

  const pickLink = (host: string, given?: string) => {
    const fromList = links.find((link) => link.toLowerCase().includes(host));
    return asUrl(
      given && given.toLowerCase().includes(host) ? given : fromList
    );
  };
  const github = pickLink('github.com', extracted.links.github);
  const linkedin = pickLink('linkedin.com', extracted.links.linkedin);
  const portfolio = asUrl(extracted.links.portfolio);
  checkUrl('Portfolio link', portfolio);

  const other = extracted.links.other
    .filter((item) => item.url)
    .map((item) => ({ label: item.label ?? item.url, url: asUrl(item.url) }));

  const roles = extracted.experience.filter(
    (role) => role.title || role.company
  );
  const projects = extracted.projects.filter((project) => project.name);

  roles.forEach((role) => {
    check('Company', role.company);
    check('Job title', role.title);
  });
  extracted.education.forEach((item) => check('School', item.institution));
  projects.forEach((project) => check('Project', project.name));

  const roleId = (i: number) => `e${i + 1}`;
  const projectId = (i: number) => `p${i + 1}`;

  const locked = {
    basics: {
      fullName: extracted.basics.fullName ?? '',
      email: email ?? '',
      phone: extracted.basics.phone ?? '',
      location: extracted.basics.location ?? '',
    },
    links: clean({
      github: github ?? '',
      linkedin: linkedin ?? '',
      portfolio: portfolio ?? '',
      other,
    }),
    education: extracted.education
      .filter((item) => item.institution || item.area)
      .map((item) =>
        clean({
          institution: item.institution ?? '',
          area: item.area ?? '',
          qualification: item.qualification,
          location: item.location,
          endDate: normalizeDate(item.endDate) ?? '',
        })
      ),
    experience: roles.map((role, i) =>
      clean({
        id: roleId(i),
        title: role.title ?? '',
        company: role.company ?? '',
        location: role.location ?? '',
        startDate: normalizeDate(role.startDate) ?? '',
        endDate: normalizeDate(role.endDate) ?? '',
        tagline: role.tagline,
        url: asUrl(role.url),
      })
    ),
    projects: projects.map((project, i) =>
      clean({
        id: projectId(i),
        name: project.name ?? '',
        technologies: project.technologies,
        url: asUrl(project.url),
      })
    ),
    hobbies: extracted.hobbies,
    certifications: extracted.certifications
      .filter((item) => item.name)
      .map((item) =>
        clean({ ...item, date: normalizeDate(item.date), url: asUrl(item.url) })
      ),
    languages: extracted.languages.filter((item) => item.language).map(clean),
    awards: extracted.awards
      .filter((item) => item.title)
      .map((item) => clean({ ...item, date: normalizeDate(item.date) })),
  };

  const tailorable = {
    headline: extracted.headline,
    summary: extracted.summary,
    experience: roles.map((role, i) => ({
      id: roleId(i),
      bullets: role.bullets.map((bullet, j) => ({
        id: `${roleId(i)}-b${j + 1}`,
        text: bullet,
      })),
    })),
    projects: projects.map((project, i) => ({
      id: projectId(i),
      description: project.description ?? '',
    })),
    skills: extracted.skills
      .filter((group) => group.items.length > 0)
      .map((group, i) => ({
        id: `s${i + 1}`,
        group: group.group ?? 'Skills',
        items: group.items,
      })),
  };

  return {
    draft: { schemaVersion: 1, locked, tailorable },
    warnings,
  };
}

/* ----------------------------- service ----------------------------- */

export function createResumeImportService({
  complete,
}: {
  complete: Complete;
}) {
  async function extract(
    text: string,
    links: string[]
  ): Promise<ExtractedResume> {
    const prompt = `HYPERLINKS FOUND IN THE PDF:\n${
      links.length ? links.map((link) => `- ${link}`).join('\n') : '(none)'
    }\n\nRESUME TEXT:\n"""\n${text}\n"""`;

    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await complete({
        system: SYSTEM_PROMPT,
        user: prompt + feedback,
      });
      try {
        return ExtractedResumeSchema.parse(JSON.parse(raw));
      } catch (error) {
        const reason =
          error instanceof Error ? error.message.slice(0, 400) : 'invalid JSON';
        feedback = `\n\nYour previous answer was rejected: ${reason}\nReturn valid JSON that follows the shape exactly.`;
      }
    }
    throw new AppError(
      502,
      'The model did not return a readable answer. Try again.'
    );
  }

  return {
    async importPdf(pdf: Buffer): Promise<ImportResult> {
      const text = await extractPdfText(pdf);
      if (text.length > MAX_TEXT_LENGTH)
        throw new AppError(
          413,
          'This PDF has too much text to read as a resume.'
        );

      const links = findLinks(text);
      const extracted = await extract(text, links);
      const { draft, warnings } = toDraft(extracted, text, links);

      const parsed = MasterResumeSchema.safeParse(draft);
      const issues = parsed.success
        ? []
        : parsed.error.issues.slice(0, 40).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          }));

      return { draft, issues, warnings };
    },
  };
}

export type ResumeImportService = ReturnType<typeof createResumeImportService>;
