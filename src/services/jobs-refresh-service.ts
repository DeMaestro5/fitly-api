import path from 'node:path';
import type { JobSourceId } from '../schemas/job.schema';
import {
  getRun,
  listJobsForScoring,
  markStale,
  recomputeDuplicates,
  saveRun,
  saveScores,
  upsertJobs,
} from '../repo/jobs.repo';
import { createFileResumeRepository } from '../repo/resume.repo';
import type { JobSource } from '../sources/source.type';
import { scoreJob } from './job-score';
import { buildSkillProfile } from './skill-profile';
import { buildBoilerplateIndex, stripBoilerplate } from './job-boilerplate';

export interface RefreshReport {
  source: JobSourceId;
  outcome: 'fetched' | 'skipped' | 'failed';
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
  durationMs: number;
}

const STALE_AFTER_DAYS = 21;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

let inFlight: Promise<RefreshReport[]> | null = null;

async function refreshSource(
  source: JobSource,
  force: boolean,
): Promise<RefreshReport> {
  const base = {
    source: source.id,
    fetched: 0,
    inserted: 0,
    updated: 0,
    error: null,
    durationMs: 0,
  };

  const last = getRun(source.id);
  if (!force && last) {
    const age = Date.now() - Date.parse(last.fetchedAt);
    if (age < (last.ok ? source.minIntervalMs : FAILURE_COOLDOWN_MS)) {
      return { ...base, outcome: 'skipped' };
    }
  }

  const started = Date.now();
  try {
    const jobs = await source.fetchJobs();
    const seenAt = new Date().toISOString();
    const { inserted, updated } = upsertJobs(jobs, seenAt);
    const durationMs = Date.now() - started;
    saveRun({
      source: source.id,
      ok: true,
      count: jobs.length,
      error: null,
      fetchedAt: seenAt,
      durationMs,
    });
    return {
      ...base,
      outcome: 'fetched',
      fetched: jobs.length,
      inserted,
      updated,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;
    saveRun({
      source: source.id,
      ok: false,
      count: 0,
      error: message,
      fetchedAt: new Date().toISOString(),
      durationMs,
    });
    return { ...base, outcome: 'failed', error: message, durationMs };
  }
}

export function refreshAll(
  sources: JobSource[],
  options: { force?: boolean } = {},
): Promise<RefreshReport[]> {
  if (inFlight) return inFlight; // a refresh is already running

  inFlight = (async () => {
    try {
      const reports = await Promise.all(
        sources.map((s) => refreshSource(s, options.force ?? false)),
      );
      markStale(
        new Date(
          Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      );

      // Stack-fit scoring: score all non-expired jobs against master resume
      try {
        const resumeRepo = createFileResumeRepository(
          path.resolve(process.cwd(), 'data/master-resume.json'),
        );
        const resume = await resumeRepo.get();
        if (resume) {
          const profile = buildSkillProfile(resume);
          const jobs = listJobsForScoring();
          const boilerplate = buildBoilerplateIndex(jobs);
          const scored = jobs.map((job) => {
            const { score, matched } = scoreJob(
              {
                ...job,
                descriptionText: stripBoilerplate(job, boilerplate),
              },
              profile,
            );
            return { id: job.id, score, matched };
          });
          saveScores(scored);
        } else {
          console.warn('Master resume not found; skipping stack-fit scoring.');
        }
      } catch (err) {
        console.warn('Could not load master resume for scoring:', err);
        console.warn('Stack-fit scoring failed; keeping previous scores:', err);
      }

      recomputeDuplicates();
      return reports;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
