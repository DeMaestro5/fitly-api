import { JobSourceId, SourceJob } from '../schemas/job.schema';

export interface JobSource {
  id: JobSourceId;
  name: string;
  minIntervalMs: number;
  fetchJobs(signal?: AbortSignal): Promise<SourceJob[]>;
}

export interface SourceStatus {
  source: JobSource;
  ok: boolean;
  count: number;
  error: string | null;
  fetchedAt: string;
  durationMs: number;
}

export interface SourceRunResult {
  status: SourceRunResult;
  jobs: SourceJob[];
}
