import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type RemoteType,
  type SourceJob,
} from '../schemas/job.schema';
import { htmlToText } from '../utils/html';
import { decodeEntities } from './hn-parse';

// Flip these to change what the company boards bring in.
const TECH_ONLY = true; // keep only engineering-looking titles
const REMOTE_ONLY = true; // keep only remote jobs

export const BoardEntrySchema = z.object({
  ats: z.enum(['greenhouse', 'lever', 'ashby']),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._%-]+$/, 'Use the name from the careers page URL'),
  name: z.string().trim().max(80).optional(),
});
export type BoardEntry = z.infer<typeof BoardEntrySchema>;
export type BoardKind = BoardEntry['ats'];

/* ----------------------------- which jobs to keep ----------------------------- */

const TECH_TITLE =
  /\b(?:engineer|engineers|engineering|developer|software|full[\s-]?stack|back[\s-]?end|front[\s-]?end|devops|sre|platform|architect|programmer|machine learning|ml|ai)\b/i;

export function isWanted(
  job: Pick<SourceJob, 'title' | 'remoteType'>,
): boolean {
  if (TECH_ONLY && !TECH_TITLE.test(job.title)) return false;
  if (REMOTE_ONLY && job.remoteType !== 'remote') return false;
  return true;
}

/* --------------------------- finding boards in links --------------------------- */

const BOARD_URLS: { ats: BoardKind; re: RegExp }[] = [
  {
    ats: 'greenhouse',
    re: /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_app\?for=)?([A-Za-z0-9_-]+)/i,
  },
  {
    ats: 'lever',
    re: /^https?:\/\/jobs(?:\.eu)?\.lever\.co\/([A-Za-z0-9_-]+)/i,
  },
  { ats: 'ashby', re: /^https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i },
];

// "https://boards.greenhouse.io/acme/jobs/123" -> { ats: 'greenhouse', slug: 'acme' }
export function boardFromUrl(
  url: string,
): { ats: BoardKind; slug: string } | null {
  for (const { ats, re } of BOARD_URLS) {
    const match = re.exec(url);
    if (!match || match[1].toLowerCase() === 'embed') continue;
    try {
      return { ats, slug: decodeURIComponent(match[1]) };
    } catch {
      return { ats, slug: match[1] };
    }
  }
  return null;
}

/* ------------------------------- shared helpers ------------------------------- */

const prettify = (slug: string): string =>
  slug.replace(/[-_.]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

const companyName = (board: BoardEntry): string =>
  board.name?.trim() || prettify(board.slug);

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;

function iso(value: string | null | undefined): string | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function remoteTypeFrom(text: string): RemoteType {
  if (/\bremote\b/i.test(text)) return 'remote';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\b(?:on-?site|in[- ]office)\b/i.test(text)) return 'onsite';
  return 'unknown';
}

// Lever and Ashby say "Remote" / "Hybrid" / "OnSite" in their own field.
function workplaceType(
  value: string | null | undefined,
  fallbackText: string,
): RemoteType {
  const v = (value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'remote') return 'remote';
  if (v === 'hybrid') return 'hybrid';
  if (v === 'onsite') return 'onsite';
  return remoteTypeFrom(fallbackText);
}

function regionFor(
  location: string | null,
  remoteType: RemoteType,
): { location: string | null; regionNote: string | null } {
  if (!location) return { location: null, regionNote: null };
  if (/\b(?:worldwide|anywhere|global)\b/i.test(location)) {
    return { location: 'Worldwide', regionNote: null };
  }
  const place = location
    .replace(/\bremote\b/gi, ' ')
    .replace(/[()\-–—,:/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!place) return { location, regionNote: null };
  const label =
    remoteType === 'remote'
      ? 'Open to'
      : remoteType === 'hybrid'
        ? 'Hybrid'
        : 'On-site';
  return {
    location: clip(location, 120),
    regionNote: `${label}: ${clip(place, 80)}`,
  };
}

function build(
  board: BoardEntry,
  rawId: string | number,
  f: {
    title: string;
    url: string;
    location: string | null;
    remoteType: RemoteType;
    employmentType: string | null;
    salaryText: string | null;
    description: string;
    postedAt: string | null;
  },
): SourceJob | null {
  const { location, regionNote } = regionFor(f.location, f.remoteType);
  const parsed = SourceJobSchema.safeParse({
    id: makeJobId('ats', `${board.ats}:${board.slug}:${rawId}`),
    source: 'ats',
    sourceUrl: f.url,
    applyUrl: f.url, // the job page has the apply button
    applyEmail: null,
    title: f.title.trim(),
    company: companyName(board),
    location,
    regionNote,
    remoteType: f.remoteType,
    employmentType: f.employmentType,
    salaryText: f.salaryText ? clip(f.salaryText, 120) : null,
    tags: [],
    descriptionText: f.description,
    postedAt: f.postedAt,
  });
  return parsed.success ? parsed.data : null;
}

/* -------------------------------- Greenhouse -------------------------------- */

const GreenhouseJob = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    absolute_url: z.string().url(),
    location: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    first_published: z.string().nullish(),
    updated_at: z.string().nullish(),
    content: z.string().nullish(),
  })
  .passthrough();

export function normalizeGreenhouse(
  raw: unknown,
  board: BoardEntry,
): SourceJob | null {
  const parsed = GreenhouseJob.safeParse(raw);
  if (!parsed.success) return null;
  const job = parsed.data;
  const place = job.location?.name?.trim() || null;
  return build(board, job.id, {
    title: job.title,
    url: job.absolute_url,
    location: place,
    remoteType: remoteTypeFrom(`${place ?? ''} ${job.title}`), // Greenhouse has no remote flag
    employmentType: null,
    salaryText: null,
    description: htmlToText(decodeEntities(job.content ?? '')), // content arrives HTML-encoded
    postedAt: iso(job.first_published ?? job.updated_at),
  });
}

/* ---------------------------------- Lever ---------------------------------- */

const LeverPosting = z
  .object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().url(),
    createdAt: z.number().nullish(),
    workplaceType: z.string().nullish(),
    categories: z
      .object({
        commitment: z.string().nullish(),
        location: z.string().nullish(),
        allLocations: z.array(z.string()).nullish(),
      })
      .passthrough()
      .nullish(),
    descriptionPlain: z.string().nullish(),
    additionalPlain: z.string().nullish(),
  })
  .passthrough();

export function normalizeLever(
  raw: unknown,
  board: BoardEntry,
): SourceJob | null {
  const parsed = LeverPosting.safeParse(raw);
  if (!parsed.success) return null;
  const job = parsed.data;
  const place =
    job.categories?.location ??
    job.categories?.allLocations?.join(' / ') ??
    null;
  return build(board, job.id, {
    title: job.text,
    url: job.hostedUrl,
    location: place,
    remoteType: workplaceType(job.workplaceType, `${place ?? ''} ${job.text}`),
    employmentType: job.categories?.commitment ?? null,
    salaryText: null,
    description: [job.descriptionPlain, job.additionalPlain]
      .filter(Boolean)
      .join('\n\n'),
    postedAt:
      typeof job.createdAt === 'number' && Number.isFinite(job.createdAt)
        ? new Date(job.createdAt).toISOString()
        : null,
  });
}

/* ---------------------------------- Ashby ---------------------------------- */

const AshbyJob = z
  .object({
    id: z.string(),
    title: z.string(),
    location: z.string().nullish(),
    isRemote: z.boolean().nullish(),
    workplaceType: z.string().nullish(),
    employmentType: z.string().nullish(),
    publishedAt: z.string().nullish(),
    isListed: z.boolean().nullish(),
    jobUrl: z.string().url(),
    descriptionPlain: z.string().nullish(),
    compensation: z
      .object({
        compensationTierSummary: z.string().nullish(),
        scrapeableCompensationSalarySummary: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const ASHBY_EMPLOYMENT: Record<string, string> = {
  FullTime: 'Full time',
  PartTime: 'Part time',
  Contract: 'Contract',
  Intern: 'Internship',
  Temporary: 'Temporary',
};

export function normalizeAshby(
  raw: unknown,
  board: BoardEntry,
): SourceJob | null {
  const parsed = AshbyJob.safeParse(raw);
  if (!parsed.success) return null;
  const job = parsed.data;
  if (job.isListed === false) return null; // unlisted roles are not public
  const place = job.location?.trim() || null;
  return build(board, job.id, {
    title: job.title,
    url: job.jobUrl,
    location: place,
    remoteType: job.isRemote
      ? 'remote'
      : workplaceType(job.workplaceType, `${place ?? ''} ${job.title}`),
    employmentType: job.employmentType
      ? (ASHBY_EMPLOYMENT[job.employmentType] ?? job.employmentType)
      : null,
    salaryText:
      job.compensation?.compensationTierSummary ??
      job.compensation?.scrapeableCompensationSalarySummary ??
      null,
    description: job.descriptionPlain ?? '',
    postedAt: iso(job.publishedAt),
  });
}
