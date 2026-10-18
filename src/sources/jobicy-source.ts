import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchJson, sleep } from '../utils/http';
import { htmlToText } from '../utils/html';
import type { JobSource } from './source.type';

const API_URL = 'https://jobicy.com/api/v2/remote-jobs';
const PAGE_SIZE = '100';
const REQUEST_GAP_MS = 1000;
const debug = process.env.JOBS_DEBUG === '1';

const QUERIES: {
  label: string;
  params: Record<string, string>;
  maxPages: number;
}[] = [
  { label: 'engineering', params: { industry: 'engineering' }, maxPages: 3 },
  { label: 'node', params: { tag: 'node' }, maxPages: 1 },
  { label: 'typescript', params: { tag: 'typescript' }, maxPages: 1 },
  { label: 'react', params: { tag: 'react' }, maxPages: 1 },
  { label: 'full stack', params: { tag: 'full stack' }, maxPages: 1 },
];

const JobicyJobSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    url: z.string().url(),
    jobTitle: z.string(),
    companyName: z.string(),
    jobIndustry: z.array(z.string()).nullish(),
    jobType: z.array(z.string()).nullish(),
    jobGeo: z.string().nullish(),
    jobExcerpt: z.string().nullish(),
    jobDescription: z.string().nullish(),
    pubDate: z.string().nullish(),
    salaryMin: z.number().nullish(),
    salaryMax: z.number().nullish(),
    salaryCurrency: z.string().nullish(),
    salaryPeriod: z.string().nullish(),
  })
  .passthrough();

type JobicyJob = z.infer<typeof JobicyJobSchema>;

const PageSchema = z
  .object({
    jobs: z.array(z.unknown()),
    nextCursor: z.string().nullish(),
  })
  .passthrough();

const PERIOD: Record<string, string> = {
  yearly: 'year',
  monthly: 'month',
  weekly: 'week',
  hourly: 'hour',
};

function salaryText(raw: JobicyJob): string | null {
  const {
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: currency,
    salaryPeriod: period,
  } = raw;
  if (!min && !max) return null;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const range =
    min && max ? `${fmt(min)}–${fmt(max)}` : fmt((min || max) as number);
  return `${currency ? currency + ' ' : ''}${range} / ${
    PERIOD[period ?? 'yearly'] ?? 'year'
  }`;
}

// "Anywhere" means worldwide; anything else is the list of eligible places.
function regionInfo(raw: JobicyJob): {
  location: string;
  regionNote: string | null;
} {
  const places = (raw.jobGeo ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    places.length === 0 ||
    places.some((p) => /^(anywhere|worldwide)$/i.test(p))
  ) {
    return { location: 'Worldwide', regionNote: null };
  }
  const shown = places.join(', ');
  return { location: shown, regionNote: `Open to: ${shown}` };
}

function normalize(raw: JobicyJob): SourceJob {
  const { location, regionNote } = regionInfo(raw);
  const posted = new Date(raw.pubDate ?? '');

  return SourceJobSchema.parse({
    id: makeJobId('jobicy', raw.id),
    source: 'jobicy',
    sourceUrl: raw.url,
    applyUrl: raw.url, // Jobicy asks that apply buttons use the feed's url
    title: raw.jobTitle.trim(),
    company: raw.companyName.trim(),
    location,
    regionNote,
    remoteType: 'remote',
    employmentType: raw.jobType?.join(', ') || null,
    salaryText: salaryText(raw),
    tags: raw.jobIndustry ?? [],
    descriptionText: htmlToText(raw.jobDescription || raw.jobExcerpt || ''),
    postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
  });
}

async function fetchPage(
  params: Record<string, string>,
  cursor: string | null
) {
  const url = new URL(API_URL);
  url.searchParams.set('count', PAGE_SIZE);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  if (cursor) url.searchParams.set('cursor', cursor);

  const json = await fetchJson<unknown>(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  return PageSchema.parse(json);
}

export function createJobicySource(): JobSource {
  return {
    id: 'jobicy',
    name: 'Jobicy',
    minIntervalMs: 2 * 60 * 60 * 1000, // their rule: no more than one pass an hour
    async fetchJobs(signal) {
      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      let lastError: unknown = null;

      for (const query of QUERIES) {
        try {
          let cursor: string | null = null;

          for (let page = 1; page <= query.maxPages; page++) {
            if (signal?.aborted) throw new Error('Jobicy fetch aborted');
            const { jobs, nextCursor } = await fetchPage(query.params, cursor);
            if (debug)
              console.log(
                `[jobicy] "${query.label}" page ${page}: ${jobs.length} jobs`
              );

            for (const item of jobs) {
              const parsed = JobicyJobSchema.safeParse(item);
              if (!parsed.success) {
                skipped++;
                continue;
              }
              try {
                const job = normalize(parsed.data);
                byId.set(job.id, job);
              } catch {
                skipped++;
              }
            }

            if (!nextCursor) break;
            cursor = nextCursor;
            await sleep(REQUEST_GAP_MS);
          }
        } catch (err) {
          console.warn(`[jobicy] "${query.label}" failed:`, err);
          lastError = err;
        }
        await sleep(REQUEST_GAP_MS);
      }

      if (skipped > 0)
        console.warn(`[jobicy] skipped ${skipped} malformed jobs`);
      if (byId.size === 0 && lastError) throw lastError;
      return Array.from(byId.values());
    },
  };
}
