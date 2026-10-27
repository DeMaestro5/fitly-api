import { z } from 'zod';
import type { SourceJob } from '../schemas/job.schema';
import { fetchJson } from '../utils/http';
import {
  isFreshEnough,
  parseHiringPost,
  selectHiringThreads,
} from './hn-parse';
import type { JobSource } from './source.type';

const SEARCH_URL =
  'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=12';
const itemUrl = (id: string) => `https://hn.algolia.com/api/v1/items/${id}`;
const JSON_OPTIONS = { headers: { Accept: 'application/json' } };

const THREADS = 2; // this month and last month
const MAX_AGE_DAYS = 30; // older posts are mostly filled; this also lets old ones expire
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

export function createHnSource(): JobSource {
  return {
    id: 'hn',
    name: 'Hacker News',
    minIntervalMs: 4 * 60 * 60 * 1000,
    async fetchJobs(signal) {
      if (signal?.aborted) throw new Error('Hacker News fetch aborted');

      const search = SearchSchema.parse(
        await fetchJson<unknown>(SEARCH_URL, JSON_OPTIONS),
      );
      const threads = selectHiringThreads(search.hits, THREADS);
      if (threads.length === 0)
        throw new Error('No "Ask HN: Who is hiring?" thread found');

      const now = Date.now();
      const byId = new Map<string, SourceJob>();
      const errors: Error[] = [];
      let skipped = 0;
      let readThreads = 0;

      for (const thread of threads) {
        try {
          const data = ThreadSchema.parse(
            await fetchJson<unknown>(itemUrl(thread.objectID), JSON_OPTIONS),
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
                postedAt: Number.isNaN(time)
                  ? null
                  : new Date(time).toISOString(),
              });
              if (job) byId.set(job.id, job);
              else skipped += 1;
            } catch {
              skipped += 1;
            }
          }
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }

      // One thread failing is tolerable; all of them failing is a real error.
      if (readThreads === 0)
        throw errors[0] ?? new Error('Could not read any hiring thread');
      if (debug)
        console.log(`[hn] ${byId.size} jobs, ${skipped} comments skipped`);
      return Array.from(byId.values());
    },
  };
}
