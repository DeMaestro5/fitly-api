import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchJson, sleep } from '../utils/http';
import { htmlToText, unescapeHtml } from '../utils/html';
import type { JobSource } from './source.type';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
const REQUEST_GAP_MS = 1500; // their API is rate-limited past a few pages
const debug = process.env.JOBS_DEBUG === '1';

const QUERIES: {
  label: string;
  params: Record<string, string>;
  visa: boolean;
  maxPages: number;
}[] = [
  { label: 'all', params: {}, visa: false, maxPages: 2 },
  {
    label: 'visa sponsorship',
    params: { visa_sponsorship: 'true' },
    visa: true,
    maxPages: 3,
  },
];

// The feed is mostly non-tech, German, on-site jobs. Keep engineering-related ones only.
const TECH =
  /software|developer|entwickl|engineer|devops|front-?end|back-?end|full[ -]?stack|programmer|programmierer|programming|\bsre\b|typescript|javascript|\breact\b|node\.?js|cloud|cyber|data (engineer|scientist)|\bit[- ](security|administrator|support)/i;
const NOT_TECH =
  /business develop|sales|marketing|recruit|account (manager|executive)|geschäftsentwickl|real estate|immobilien/i;

const ArbeitnowJobSchema = z
  .object({
    slug: z.string(),
    company_name: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    remote: z.boolean().nullish(),
    url: z.string().url(),
    tags: z.array(z.string()).nullish(),
    job_types: z.array(z.string()).nullish(),
    location: z.string().nullish(),
    created_at: z.number().nullish(),
  })
  .passthrough();

type ArbeitnowJob = z.infer<typeof ArbeitnowJobSchema>;

const PageSchema = z.object({ data: z.array(z.unknown()) }).passthrough();

const isTech = (raw: ArbeitnowJob) =>
  TECH.test(`${raw.title} ${(raw.tags ?? []).join(' ')}`) &&
  !NOT_TECH.test(raw.title);

function normalize(raw: ArbeitnowJob, visa: boolean): SourceJob {
  const location = raw.location?.trim() ?? '';
  // The remote flag misses things like "Remote - Germany Only", so check the text too.
  const isRemote =
    raw.remote === true ||
    /\bremote\b|home.?office/i.test(`${location} ${raw.title}`);

  let html = raw.description ?? '';
  if (/&lt;\/?(p|div|ul|h[1-6])\b/i.test(html)) html = unescapeHtml(html);
  const text = htmlToText(html)
    .replace(
      /\s*Find (more )?(English Speaking )?Jobs in Germany on Arbeitnow\s*$/i,
      ''
    )
    .trim();

  const employmentType = (raw.job_types ?? []).find((t) =>
    /time|contract|freelance|intern/i.test(t)
  );
  const tags = [...(raw.tags ?? []), ...(visa ? ['Visa sponsorship'] : [])];

  return SourceJobSchema.parse({
    id: makeJobId('arbeitnow', raw.slug),
    source: 'arbeitnow',
    sourceUrl: raw.url,
    applyUrl: raw.url,
    title: raw.title.trim(),
    company: raw.company_name.trim(),
    location: location || null,
    regionNote: isRemote
      ? location && !/^remote$/i.test(location)
        ? `Listed location: ${location}`
        : null
      : `On-site: ${location || 'Germany'}`,
    remoteType: isRemote ? 'remote' : 'onsite',
    employmentType: employmentType ?? null,
    salaryText: null,
    tags,
    descriptionText: text,
    postedAt: raw.created_at
      ? new Date(raw.created_at * 1000).toISOString()
      : null,
  });
}

async function fetchPage(
  params: Record<string, string>,
  page: number
): Promise<unknown[]> {
  const url = new URL(API_URL);
  url.searchParams.set('page', String(page));
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const json = await fetchJson<unknown>(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  return PageSchema.parse(json).data;
}

export function createArbeitnowSource(): JobSource {
  return {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    minIntervalMs: 3 * 60 * 60 * 1000,
    async fetchJobs(signal) {
      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      let lastError: unknown = null;

      for (const query of QUERIES) {
        try {
          for (let page = 1; page <= query.maxPages; page++) {
            if (signal?.aborted) throw new Error('Arbeitnow fetch aborted');
            const items = await fetchPage(query.params, page);
            if (debug)
              console.log(
                `[arbeitnow] "${query.label}" page ${page}: ${items.length} items`
              );
            if (items.length === 0) break;

            for (const item of items) {
              const parsed = ArbeitnowJobSchema.safeParse(item);
              if (!parsed.success) {
                skipped++;
                continue;
              }
              if (!isTech(parsed.data)) continue;
              try {
                const job = normalize(parsed.data, query.visa);
                const existing = byId.get(job.id);
                if (existing) {
                  if (
                    query.visa &&
                    !existing.tags.includes('Visa sponsorship')
                  ) {
                    existing.tags.push('Visa sponsorship');
                  }
                } else {
                  byId.set(job.id, job);
                }
              } catch {
                skipped++;
              }
            }
            await sleep(REQUEST_GAP_MS);
          }
        } catch (err) {
          console.warn(`[arbeitnow] "${query.label}" failed:`, err);
          lastError = err;
        }
      }

      if (skipped > 0)
        console.warn(`[arbeitnow] skipped ${skipped} malformed jobs`);
      if (byId.size === 0 && lastError) throw lastError;
      return Array.from(byId.values());
    },
  };
}
