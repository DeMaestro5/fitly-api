import { z } from 'zod';
import type { SourceJob } from '../schemas/job.schema';
import { fetchJson } from '../utils/http';
import { parseHnJobStory } from './hn-jobs-parse';
import {
  isFreshEnough,
  parseHiringPost,
  selectHiringThreads,
} from './hn-parse';
import type { JobSource } from './source.type';

const SEARCH_URL =
  'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=12';
const itemUrl = (id: string) => `https://hn.algolia.com/api/v1/items/${id}`;
const JOB_IDS_URL = 'https://hacker-news.firebaseio.com/v0/jobstories.json';
const jobItemUrl = (id: number) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const JSON_OPTIONS = { headers: { Accept: 'application/json' } };

const THREADS = 2; // this month and last month
const MAX_AGE_DAYS = 30; // older posts are mostly filled; this also lets old ones expire
const JOB_STORIES = 60; // newest YC job posts to look at
const JOB_BATCH = 10; // item requests sent at the same time
const debug = process.env.JOBS_DEBUG === '1';

const SearchSchema = z
  .object({
    hits: z.array(
      z
        .object({ objectID: z.string(), title: z.string().nullish() })
        .passthrough(),
    ),
  })
  .passthrough();

const ThreadSchema = z
  .object({ children: z.array(z.unknown()).default([]) })
  .passthrough();

const CommentSchema = z
  .object({
    id: z.number(),
    author: z.string().nullish(),
    text: z.string().nullish(),
    created_at: z.string().nullish(),
  })
  .passthrough();

const JobIdsSchema = z.array(z.number());

const JobItemSchema = z
  .object({
    id: z.number(),
    type: z.string().nullish(),
    title: z.string().nullish(),
    url: z.string().nullish(),
    text: z.string().nullish(),
    time: z.number().nullish(),
    dead: z.boolean().nullish(),
    deleted: z.boolean().nullish(),
  })
  .passthrough();

const asError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason));

// Feed 1: the monthly "Who is hiring?" threads (comments).
async function fetchThreadJobs(
  now: number,
  signal?: AbortSignal,
): Promise<SourceJob[]> {
  const options = { ...JSON_OPTIONS, signal };
  const search = SearchSchema.parse(
    await fetchJson<unknown>(SEARCH_URL, options),
  );
  const threads = selectHiringThreads(search.hits, THREADS);
  if (threads.length === 0)
    throw new Error('No "Ask HN: Who is hiring?" thread found');

  const byId = new Map<string, SourceJob>();
  const errors: Error[] = [];
  let skipped = 0;
  let readThreads = 0;

  for (const thread of threads) {
    try {
      const data = ThreadSchema.parse(
        await fetchJson<unknown>(itemUrl(thread.objectID), options),
      );
      readThreads += 1;

      // Direct children of the thread are the job posts; replies sit deeper and are ignored.
      for (const child of data.children) {
        const parsed = CommentSchema.safeParse(child);
        if (!parsed.success) {
          skipped += 1;
          continue;
        }
        const comment = parsed.data;
        const html = comment.text;
        if (!html) {
          skipped += 1; // deleted or dead comments have no text
          continue;
        }
        if (comment.author === 'whoishiring') continue;
        if (!isFreshEnough(comment.created_at, now, MAX_AGE_DAYS)) continue;

        try {
          const time = comment.created_at
            ? Date.parse(comment.created_at)
            : NaN;
          const job = parseHiringPost({
            id: comment.id,
            html,
            postedAt: Number.isNaN(time) ? null : new Date(time).toISOString(),
          });
          if (job) byId.set(job.id, job);
          else skipped += 1;
        } catch {
          skipped += 1;
        }
      }
    } catch (err) {
      errors.push(asError(err));
    }
  }

  // One thread failing is tolerable; all of them failing is a real error.
  if (readThreads === 0)
    throw errors[0] ?? new Error('Could not read any hiring thread');
  if (debug)
    console.log(`[hn] threads: ${byId.size} jobs, ${skipped} comments skipped`);
  return Array.from(byId.values());
}

// Feed 2: the "Jobs" feed (job posts by YC companies, spread through the month).
async function fetchYcJobs(
  now: number,
  signal?: AbortSignal,
): Promise<SourceJob[]> {
  const options = { ...JSON_OPTIONS, signal };
  const ids = JobIdsSchema.parse(
    await fetchJson<unknown>(JOB_IDS_URL, options),
  ).slice(0, JOB_STORIES);

  const jobs: SourceJob[] = [];
  let skipped = 0;

  for (let i = 0; i < ids.length; i += JOB_BATCH) {
    const results = await Promise.allSettled(
      ids
        .slice(i, i + JOB_BATCH)
        .map((id) => fetchJson<unknown>(jobItemUrl(id), options)),
    );
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        skipped += 1;
        continue;
      }
      const parsed = JobItemSchema.safeParse(result.value);
      if (
        !parsed.success ||
        parsed.data.type !== 'job' ||
        parsed.data.dead ||
        parsed.data.deleted ||
        !parsed.data.title
      ) {
        skipped += 1;
        continue;
      }
      const { id, title, url, text, time } = parsed.data;
      const postedAt = time ? new Date(time * 1000).toISOString() : null;
      if (!isFreshEnough(postedAt, now, MAX_AGE_DAYS)) continue;
      try {
        const job = parseHnJobStory({
          id,
          title,
          url: url ?? null,
          text: text ?? null,
          time: time ?? null,
        });
        if (job) jobs.push(job);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  if (debug)
    console.log(`[hn] jobs feed: ${jobs.length} jobs, ${skipped} skipped`);
  return jobs;
}

export function createHnSource(): JobSource {
  return {
    id: 'hn',
    name: 'Hacker News',
    minIntervalMs: 4 * 60 * 60 * 1000,
    async fetchJobs(signal) {
      if (signal?.aborted) throw new Error('Hacker News fetch aborted');
      const now = Date.now();

      // Each feed can fail on its own without losing the other one's jobs.
      const feeds = await Promise.allSettled([
        fetchThreadJobs(now, signal),
        fetchYcJobs(now, signal),
      ]);
      if (feeds.every((feed) => feed.status === 'rejected')) {
        throw asError(feeds[0].status === 'rejected' ? feeds[0].reason : null);
      }

      const byId = new Map<string, SourceJob>();
      for (const feed of feeds) {
        if (feed.status === 'rejected') {
          console.error('[hn] one feed failed:', asError(feed.reason).message);
          continue;
        }
        for (const job of feed.value) byId.set(job.id, job);
      }
      return Array.from(byId.values());
    },
  };
}
