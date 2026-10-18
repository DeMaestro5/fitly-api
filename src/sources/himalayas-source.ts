import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchJson, sleep } from '../utils/http';
import { htmlToText } from '../utils/html';
import type { JobSource } from './source.type';

const SEARCH_URL = 'https://himalayas.app/jobs/api/search';
const QUERIES = [
  'full stack',
  'fullstack',
  'node.js',
  'typescript',
  'react',
  'backend engineer',
  'software engineer',
];
const PAGES_PER_QUERY = 5;
const REQUEST_GAP_MS = 700;

// Docs say objects, real data returns plain strings. Accept both.
const CountrySchema = z.union([
  z.string(),
  z.object({ name: z.string() }).passthrough(),
]);

const HimalayasJobSchema = z
  .object({
    title: z.string(),
    companyName: z.string(),
    employmentType: z.string().nullish(),
    minSalary: z.number().nullish(),
    maxSalary: z.number().nullish(),
    salaryPeriod: z.string().nullish(),
    currency: z.string().nullish(),
    locationRestrictions: z.array(CountrySchema).nullish(),
    categories: z.array(z.string()).nullish(),
    parentCategories: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    excerpt: z.string().nullish(),
    pubDate: z.number().nullish(),
    applicationLink: z.string().url(),
    guid: z.string(),
  })
  .passthrough();

type HimalayasJob = z.infer<typeof HimalayasJobSchema>;

const ResponseSchema = z.object({ jobs: z.array(z.unknown()) }).passthrough();

const PERIOD: Record<string, string> = {
  hourly: 'hour',
  weekly: 'week',
  fortnightly: 'fortnight',
  monthly: 'month',
  annual: 'year',
};

// Docs say milliseconds, real data is seconds. Handle both.
function toIso(value: number | null | undefined): string | null {
  if (value == null) return null;
  const date = new Date(value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function salaryText(raw: HimalayasJob): string | null {
  const { minSalary: min, maxSalary: max, currency, salaryPeriod } = raw;
  if (min == null && max == null) return null;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const range =
    min != null && max != null
      ? `${fmt(min)}–${fmt(max)}`
      : fmt((min ?? max) as number);
  const period = PERIOD[salaryPeriod ?? 'annual'] ?? 'year';
  return `${currency ? currency + ' ' : ''}${range} / ${period}`;
}

// Empty list means worldwide.
function regionInfo(raw: HimalayasJob): {
  location: string;
  regionNote: string | null;
} {
  const names = (raw.locationRestrictions ?? []).map((c) =>
    typeof c === 'string' ? c : c.name
  );
  if (names.length === 0) return { location: 'Worldwide', regionNote: null };
  const shown =
    names.length <= 5
      ? names.join(', ')
      : `${names.slice(0, 5).join(', ')} +${names.length - 5} more`;
  return { location: shown, regionNote: `Limited to: ${shown}` };
}

function normalize(raw: HimalayasJob): SourceJob {
  const { location, regionNote } = regionInfo(raw);
  const text = htmlToText(raw.description ?? raw.excerpt ?? '').replace(
    /\s*Originally posted on Himalayas\s*$/i,
    ''
  );
  const tags = Array.from(
    new Set(
      [...(raw.categories ?? []), ...(raw.parentCategories ?? [])].map((t) =>
        t.replace(/-/g, ' ')
      )
    )
  ).slice(0, 20);
  const sourceId = new URL(raw.guid).pathname.replace(/^\/companies\//, '');

  return SourceJobSchema.parse({
    id: makeJobId('himalayas', sourceId),
    source: 'himalayas',
    sourceUrl: raw.applicationLink, // Himalayas terms: apply must use applicationLink
    applyUrl: raw.applicationLink,
    title: raw.title.trim(),
    company: raw.companyName.trim(),
    location,
    regionNote,
    remoteType: 'remote', // every Himalayas job is remote
    employmentType: raw.employmentType ?? null,
    salaryText: salaryText(raw),
    tags,
    descriptionText: text,
    postedAt: toIso(raw.pubDate),
  });
}

async function fetchPage(
  q: string,
  page: number,
  apiKey?: string
): Promise<unknown[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('sort', 'recent');
  url.searchParams.set('page', String(page));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const json = await fetchJson<unknown>(url.toString(), { headers });
  return ResponseSchema.parse(json).jobs;
}

export function createHimalayasSource(apiKey?: string): JobSource {
  return {
    id: 'himalayas',
    name: 'Himalayas',
    minIntervalMs: 12 * 60 * 60 * 1000, // their data refreshes every 24h
    async fetchJobs(signal) {
      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      let lastError: unknown = null;

      for (const q of QUERIES) {
        try {
          for (let page = 1; page <= PAGES_PER_QUERY; page++) {
            if (signal?.aborted) throw new Error('Himalayas fetch aborted');
            const rawJobs = await fetchPage(q, page, apiKey);
            for (const item of rawJobs) {
              const parsed = HimalayasJobSchema.safeParse(item);
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

            if (rawJobs.length === 0) break;
            await sleep(REQUEST_GAP_MS);
          }
        } catch (err) {
          console.warn(`[himalayas] "${q}" failed:`, err);
          lastError = err; // keep what we have, move to the next query
        }
      }

      if (skipped > 0)
        console.warn(`[himalayas] skipped ${skipped} malformed jobs`);
      if (byId.size === 0 && lastError) throw lastError;
      return Array.from(byId.values());
    },
  };
}
