import {
  countJobs,
  getJob,
  getRuns,
  JobDetail,
  JobFilters,
  JobListResults,
  JobPatch,
  listJobs,
  updateJob,
} from '../repo/jobs.repo';
import { JobSourceId } from '../schemas/job.schema';
import { JobSource } from '../sources/source.type';
import { refreshAll, RefreshReport } from './jobs-refresh-service';
import type { MasterResume } from '../schemas/resume.schema';
import type { EmailDraft, EmailService } from './email-service';

export class UnknownSourceError extends Error {
  constructor(source: string) {
    super(`No adapter is configured for source "${source}"`);
    this.name = 'UnknownSourceError';
  }
}

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job "${id}" not found`);
    this.name = 'JobNotFoundError';
  }
}

export class NoApplyEmailError extends Error {
  constructor() {
    super('This job has no apply email, so no email can be drafted');
    this.name = 'NoApplyEmailError';
  }
}

export class MasterResumeMissingError extends Error {
  constructor() {
    super('No master resume is saved yet');
    this.name = 'MasterResumeMissingError';
  }
}

export interface SourceOverview {
  source: JobSourceId;
  minIntervalMs: number;
  ok: boolean | null;
  count: number;
  error: string | null;
  fetchedAt: string | null;
  durationMs: number | null;
  visibleJobs: number;
}

export function createJobsService(deps: {
  sources: JobSource[];
  emailService: EmailService;
  loadMasterResume: () =>
    | MasterResume
    | undefined
    | Promise<MasterResume | undefined>;
}) {
  const { sources, emailService, loadMasterResume } = deps;

  return {
    list: (filters: JobFilters): JobListResults => listJobs(filters),
    get: (id: string): JobDetail | undefined => getJob(id),
    update: (id: string, patch: JobPatch): JobDetail | undefined =>
      updateJob(id, patch),

    async refresh(options: {
      source?: JobSourceId;
      force: boolean;
    }): Promise<RefreshReport[]> {
      const selected = options.source
        ? sources.filter((s) => s.id === options.source)
        : sources;

      if (selected.length === 0) {
        throw new UnknownSourceError(options.source ?? '(none)');
      }
      return refreshAll(selected, { force: options.force });
    },

    async draftEmail(id: string): Promise<EmailDraft & { to: string }> {
      const job = getJob(id);
      if (!job) throw new JobNotFoundError(id);
      if (!job.applyEmail) throw new NoApplyEmailError();

      const master = await loadMasterResume();
      if (!master) throw new MasterResumeMissingError();

      const draft = await emailService.write(master, job);
      return { to: job.applyEmail, ...draft };
    },

    sources(): SourceOverview[] {
      const runs = new Map(getRuns().map((run) => [run.source, run]));
      const visible = countJobs().visibleBySource;
      return sources.map((source) => {
        const run = runs.get(source.id);
        return {
          source: source.id,
          minIntervalMs: source.minIntervalMs,
          ok: run ? run.ok : null,
          count: run?.count ?? 0,
          error: run?.error ?? null,
          fetchedAt: run?.fetchedAt ?? null,
          durationMs: run?.durationMs ?? null,
          visibleJobs: visible[source.id] ?? 0,
        };
      });
    },
  };
}

export type JobsService = ReturnType<typeof createJobsService>;
