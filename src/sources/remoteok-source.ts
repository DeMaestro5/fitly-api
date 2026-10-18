import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchJson, sleep } from '../utils/http';
import { fixMojibake, htmlToText } from '../utils/html';
import type { JobSource } from './source.type';

const API_URL = 'https://remoteok.com/api';
const TAGS = ['dev', 'javascript', 'typescript', 'node', 'react', 'backend'];
const REQUEST_GAP_MS = 1000;
const debug = process.env.JOBS_DEBUG === '1';

const RemoteOkJobSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    epoch: z.number().nullish(),
    date: z.string().nullish(),
    company: z.string(),
    position: z.string(),
    tags: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    location: z.string().nullish(),
    apply_url: z.string().url().nullish(),
    url: z.string().url(),
    salary_min: z.number().nullish(),
    salary_max: z.number().nullish(),
  })
  .passthrough();

type RemoteOkJob = z.infer<typeof RemoteOkJobSchema>;

const GENERIC_LOCATION =
  /^(remote|worldwide|anywhere|global|work from home)?$/i;
const ANTI_SPAM = /\s*Please mention the word\s+\*\*[A-Z]+\*\*[\s\S]*$/i;

function toIso(raw: RemoteOkJob): string | null {
  const date =
    raw.epoch != null ? new Date(raw.epoch * 1000) : new Date(raw.date ?? '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function salaryText(raw: RemoteOkJob): string | null {
  const min = raw.salary_min || 0;
  const max = raw.salary_max || 0;
  if (!min && !max) return null;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const range = min && max ? `${fmt(min)}–${fmt(max)}` : fmt(min || max);
  return `USD ${range} / year`;
}

function normalize(raw: RemoteOkJob): SourceJob {
  const location = raw.location?.trim() ?? '';
  const description = htmlToText(
    fixMojibake((raw.description ?? '').replace(/\\n/g, '\n'))
  ).replace(ANTI_SPAM, '');

  return SourceJobSchema.parse({
    id: makeJobId('remoteok', raw.id),
    source: 'remoteok',
    sourceUrl: raw.url,
    applyUrl: raw.apply_url ?? raw.url,
    title: fixMojibake(raw.position).trim(),
    company: fixMojibake(raw.company).trim(),
    location: location || null,
    regionNote: GENERIC_LOCATION.test(location)
      ? null
      : `Listed location: ${location}`,
    remoteType: 'remote',
    employmentType: null,
    salaryText: salaryText(raw),
    tags: raw.tags ?? [],
    descriptionText: description.trim(),
    postedAt: toIso(raw),
  });
}

async function fetchTag(tag: string): Promise<unknown[]> {
  const url = new URL(API_URL);
  url.searchParams.set('tag', tag);
  const json = await fetchJson<unknown>(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Fitly/1.0 (personal job tool)',
    },
  });
  return z.array(z.unknown()).parse(json);
}

export function createRemoteOkSource(): JobSource {
  return {
    id: 'remoteok',
    name: 'Remote OK',
    minIntervalMs: 2 * 60 * 60 * 1000,
    async fetchJobs(signal) {
      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      let lastError: unknown = null;

      for (const tag of TAGS) {
        try {
          if (signal?.aborted) throw new Error('Remote OK fetch aborted');
          const items = await fetchTag(tag);
          if (debug)
            console.log(`[remoteok] tag "${tag}": ${items.length} items`);

          for (const item of items) {
            if (item && typeof item === 'object' && 'legal' in item) continue; // legal notice
            const parsed = RemoteOkJobSchema.safeParse(item);
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
        } catch (err) {
          console.warn(`[remoteok] tag "${tag}" failed:`, err);
          lastError = err;
        }
        await sleep(REQUEST_GAP_MS);
      }

      if (skipped > 0)
        console.warn(`[remoteok] skipped ${skipped} malformed jobs`);
      if (byId.size === 0 && lastError) throw lastError;
      return Array.from(byId.values());
    },
  };
}
