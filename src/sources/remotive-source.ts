import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchJson } from '../utils/http';
import { htmlToText } from '../utils/html';
import type { JobSource } from './source.type';

const API_URL = 'https://remotive.com/api/remote-jobs?category=software-dev';
const debug = process.env.JOBS_DEBUG === '1';

// Built from Remotive's published docs; loosened so a missing field never drops a job.
const RemotiveJobSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    url: z.string().url(),
    title: z.string(),
    company_name: z.string(),
    category: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    job_type: z.string().nullish(),
    publication_date: z.string().nullish(),
    candidate_required_location: z.string().nullish(),
    salary: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();

type RemotiveJob = z.infer<typeof RemotiveJobSchema>;

const ResponseSchema = z.object({ jobs: z.array(z.unknown()) }).passthrough();

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  // Dates may come without a timezone; treat those as UTC.
  const date = new Date(
    /(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : value + 'Z'
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalize(raw: RemotiveJob): SourceJob {
  const place = raw.candidate_required_location?.trim() ?? '';
  const worldwide = /^(worldwide|anywhere|global)?$/i.test(place);

  return SourceJobSchema.parse({
    id: makeJobId('remotive', raw.id),
    source: 'remotive',
    sourceUrl: raw.url,
    applyUrl: raw.url, // Remotive: link to their page and credit them
    title: raw.title.trim(),
    company: raw.company_name.trim(),
    location: worldwide ? 'Worldwide' : place,
    regionNote: worldwide ? null : `Open to: ${place}`,
    remoteType: 'remote',
    employmentType: raw.job_type ? raw.job_type.replace(/_/g, ' ') : null,
    salaryText: raw.salary?.trim() || null,
    tags: Array.from(
      new Set(
        [raw.category, ...(raw.tags ?? [])].filter((t): t is string => !!t)
      )
    ),
    descriptionText: htmlToText(raw.description ?? ''),
    postedAt: toIso(raw.publication_date),
  });
}

export function createRemotiveSource(): JobSource {
  return {
    id: 'remotive',
    name: 'Remotive',
    minIntervalMs: 6 * 60 * 60 * 1000, // they advise at most ~4 calls a day
    async fetchJobs(signal) {
      if (signal?.aborted) throw new Error('Remotive fetch aborted');
      const json = await fetchJson<unknown>(API_URL, {
        headers: { Accept: 'application/json' },
      });
      const items = ResponseSchema.parse(json).jobs;
      if (debug) console.log(`[remotive] ${items.length} items`);

      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      for (const item of items) {
        const parsed = RemotiveJobSchema.safeParse(item);
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
      if (skipped > 0)
        console.warn(`[remotive] skipped ${skipped} malformed jobs`);
      return Array.from(byId.values());
    },
  };
}
