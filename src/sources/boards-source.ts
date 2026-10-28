import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { SourceJob } from '../schemas/job.schema';
import { fetchJson } from '../utils/http';
import {
  BoardEntrySchema,
  isWanted,
  normalizeAshby,
  normalizeGreenhouse,
  normalizeLever,
  type BoardEntry,
} from './boards-parse';
import type { JobSource } from './source.type';

const LIST_FILE = path.resolve(process.cwd(), 'data/company-boards.json');
const JSON_OPTIONS = { headers: { Accept: 'application/json' } };
const LEVER_HOSTS = ['https://api.lever.co', 'https://api.eu.lever.co'];
const CONCURRENCY = 4;
const debug = process.env.JOBS_DEBUG === '1';

const JobsEnvelope = z.object({ jobs: z.array(z.unknown()) }).passthrough();
const isJob = (job: SourceJob | null): job is SourceJob => job !== null;

async function loadWatchList(): Promise<BoardEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(LIST_FILE, 'utf8');
  } catch {
    return []; // no list yet: nothing to fetch
  }
  return z.array(BoardEntrySchema).parse(JSON.parse(raw));
}

async function greenhouse(board: BoardEntry): Promise<SourceJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true`;
  const { jobs } = JobsEnvelope.parse(
    await fetchJson<unknown>(url, JSON_OPTIONS),
  );
  return jobs.map((job) => normalizeGreenhouse(job, board)).filter(isJob);
}

// Some companies live on Lever's EU host. An unknown or empty board on the main host is retried there.
async function leverPostings(slug: string): Promise<unknown[]> {
  let empty: unknown[] | null = null;
  let lastError: unknown = null;
  for (const host of LEVER_HOSTS) {
    try {
      const url = `${host}/v0/postings/${encodeURIComponent(slug)}?mode=json`;
      const list = z
        .array(z.unknown())
        .parse(await fetchJson<unknown>(url, JSON_OPTIONS));
      if (list.length > 0) return list;
      empty = list;
    } catch (err) {
      lastError = err;
    }
  }
  if (empty) return empty;
  throw lastError instanceof Error
    ? lastError
    : new Error(`Lever board "${slug}" not found`);
}

async function lever(board: BoardEntry): Promise<SourceJob[]> {
  const postings = await leverPostings(board.slug);
  return postings
    .map((posting) => normalizeLever(posting, board))
    .filter(isJob);
}

async function ashby(board: BoardEntry): Promise<SourceJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}?includeCompensation=true`;
  const { jobs } = JobsEnvelope.parse(
    await fetchJson<unknown>(url, JSON_OPTIONS),
  );
  return jobs.map((job) => normalizeAshby(job, board)).filter(isJob);
}

const FETCHERS = { greenhouse, lever, ashby } as const;

// Runs fn over items, a few at a time, so 30 companies do not all hit the network at once.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function createBoardsSource(): JobSource {
  return {
    id: 'ats',
    name: 'Company boards',
    minIntervalMs: 6 * 60 * 60 * 1000,
    async fetchJobs(signal) {
      if (signal?.aborted) throw new Error('Company boards fetch aborted');
      const boards = await loadWatchList();
      if (boards.length === 0) return [];

      const failures: string[] = [];
      const results = await mapLimit(boards, CONCURRENCY, async (board) => {
        try {
          return await FETCHERS[board.ats](board);
        } catch (err) {
          failures.push(
            `${board.ats}:${board.slug} (${err instanceof Error ? err.message : String(err)})`,
          );
          return [] as SourceJob[];
        }
      });

      // One wrong company name should not break the rest; everything failing is a real error.
      if (failures.length === boards.length) {
        throw new Error(
          `Every company board failed: ${failures.slice(0, 3).join('; ')}`,
        );
      }
      if (failures.length > 0) {
        console.warn(
          `[boards] ${failures.length} of ${boards.length} failed: ${failures.slice(0, 5).join('; ')}`,
        );
      }

      const byId = new Map<string, SourceJob>();
      for (const job of results.flat())
        if (isWanted(job)) byId.set(job.id, job);
      if (debug)
        console.log(
          `[boards] ${byId.size} jobs kept from ${boards.length} boards`,
        );
      return Array.from(byId.values());
    },
  };
}
