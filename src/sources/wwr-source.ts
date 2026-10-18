import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type SourceJob,
} from '../schemas/job.schema';
import { fetchText, sleep } from '../utils/http';
import { htmlToText } from '../utils/html';
import type { JobSource } from './source.type';

const BASE_URL = 'https://weworkremotely.com';
const FEEDS = [
  '/categories/remote-full-stack-programming-jobs.rss',
  '/categories/remote-back-end-programming-jobs.rss',
  '/categories/remote-front-end-programming-jobs.rss',
  '/categories/remote-programming-jobs.rss',
];
const REQUEST_GAP_MS = 1000;
const debug = process.env.JOBS_DEBUG === '1';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

const ItemSchema = z
  .object({
    title: z.string(),
    link: z.string().url(),
    pubDate: z.string().optional(),
    country: z.string().optional(),
    skills: z.string().optional(),
    category: z.string().optional(),
    type: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

type WwrItem = z.infer<typeof ItemSchema>;

const GENERIC_PLACE = /^(remote|worldwide|anywhere|global)?$/i;

function parseItems(xml: string): unknown[] {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

const stripFlag = (s: string) =>
  s.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim();

function headquarters(text: string): string | null {
  const match = text.match(/Headquarters:\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function normalize(raw: WwrItem): SourceJob {
  // Titles look like "Company: Job Title" or "Company : Job Title".
  const split = raw.title.match(/^(.+?)\s*:\s+(.+)$/);
  const company = split ? split[1].trim() : 'Unknown company';
  const title = split ? split[2].trim() : raw.title.trim();

  const text = htmlToText(raw.description ?? '')
    .replace(/\s*To apply:\s*https?:\/\/\S+\s*$/i, '')
    .trim();

  // WWR's own "region" field says "Anywhere in the World" for almost everything,
  // so we ignore it and read the headquarters line from the posting instead.
  const hq = headquarters(text);
  const hqUseful = hq !== null && !GENERIC_PLACE.test(hq);
  const country = raw.country ? stripFlag(raw.country) : '';

  const skills = (raw.skills ?? '')
    .split(/\s*,\s*(?:and\s+)?/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = Array.from(
    new Set([raw.category, ...skills].filter((t): t is string => !!t))
  );

  const posted = new Date(raw.pubDate ?? '');
  const slug = new URL(raw.link).pathname.replace(/^\/remote-jobs\//, '');

  return SourceJobSchema.parse({
    id: makeJobId('wwr', slug),
    source: 'wwr',
    sourceUrl: raw.link,
    applyUrl: raw.link,
    title,
    company,
    location: hqUseful ? hq : country || null,
    regionNote: hqUseful
      ? `Headquarters: ${hq}`
      : country
      ? `Based in: ${country}`
      : null,
    remoteType: 'remote',
    employmentType: raw.type?.trim() || null,
    salaryText: null,
    tags,
    descriptionText: text,
    postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
  });
}

export function createWwrSource(): JobSource {
  return {
    id: 'wwr',
    name: 'We Work Remotely',
    minIntervalMs: 60 * 60 * 1000, // feed ttl is 60 minutes
    async fetchJobs(signal) {
      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      let lastError: unknown = null;

      for (const path of FEEDS) {
        try {
          if (signal?.aborted) throw new Error('WWR fetch aborted');
          const xml = await fetchText(BASE_URL + path, {
            headers: {
              Accept: 'application/rss+xml',
              'User-Agent': 'Fitly/1.0 (personal job tool)',
            },
          });
          const items = parseItems(xml);
          if (debug) console.log(`[wwr] ${path}: ${items.length} items`);

          for (const item of items) {
            const parsed = ItemSchema.safeParse(item);
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
          console.warn(`[wwr] ${path} failed:`, err);
          lastError = err;
        }
        await sleep(REQUEST_GAP_MS);
      }

      if (skipped > 0) console.warn(`[wwr] skipped ${skipped} malformed jobs`);
      if (byId.size === 0 && lastError) throw lastError;
      return Array.from(byId.values());
    },
  };
}
