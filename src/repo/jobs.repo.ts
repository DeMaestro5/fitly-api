import type { JobSourceId, SourceJob } from '../schemas/job.schema';
import type { SourceStatus } from '../sources/source.type';
import {
  assignDuplicates,
  dedupeKey,
  type DedupeRow,
} from '../services/job-dedupe';
import { getDb } from './db';

export interface UpsertResult {
  inserted: number;
  updated: number;
}

// Source facts are refreshed on every fetch; status, notes and score are never touched here.
export function upsertJobs(jobs: SourceJob[], seenAt: string): UpsertResult {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM jobs WHERE id = ?');
  const upsert = db.prepare(`
    INSERT INTO jobs (
      id, source, source_url, apply_url, title, company, location, region_note, remote_type,
      employment_type, salary_text, tags, description_text, posted_at,
      first_seen_at, last_seen_at, dedupe_key
    ) VALUES (
      @id, @source, @sourceUrl, @applyUrl, @title, @company, @location, @regionNote, @remoteType,
      @employmentType, @salaryText, @tags, @descriptionText, @postedAt,
      @seenAt, @seenAt, @dedupeKey
    )
    ON CONFLICT(id) DO UPDATE SET
      source_url = excluded.source_url,
      apply_url = excluded.apply_url,
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      region_note = excluded.region_note,
      remote_type = excluded.remote_type,
      employment_type = excluded.employment_type,
      salary_text = excluded.salary_text,
      tags = excluded.tags,
      description_text = excluded.description_text,
      posted_at = excluded.posted_at,
      last_seen_at = excluded.last_seen_at,
      expired = 0,
      dedupe_key = excluded.dedupe_key
  `);

  let inserted = 0;
  let updated = 0;

  db.transaction((items: SourceJob[]) => {
    for (const job of items) {
      const isNew = !exists.get(job.id);
      upsert.run({
        ...job,
        tags: JSON.stringify(job.tags),
        seenAt,
        dedupeKey: dedupeKey(job),
      });
      if (isNew) inserted++;
      else updated++;
    }
  })(jobs);

  return { inserted, updated };
}

// Feeds only show a window of recent jobs, so "not seen for a while" is how we expire them.
export function markStale(cutoffIso: string): number {
  return getDb()
    .prepare(
      'UPDATE jobs SET expired = 1 WHERE expired = 0 AND last_seen_at < ?',
    )
    .run(cutoffIso).changes;
}

export function recomputeDuplicates(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, source, salary_text AS salaryText, length(description_text) AS descLength,
              dedupe_key AS dedupeKey
       FROM jobs WHERE expired = 0`,
    )
    .all() as DedupeRow[];

  const assignments = assignDuplicates(rows);
  const reset = db.prepare(
    'UPDATE jobs SET duplicate_of = NULL WHERE duplicate_of IS NOT NULL',
  );
  const set = db.prepare('UPDATE jobs SET duplicate_of = ? WHERE id = ?');

  db.transaction(() => {
    reset.run();
    for (const [id, canonicalId] of assignments) set.run(canonicalId, id);
  })();

  return assignments.size;
}

interface RunRow {
  source: JobSourceId;
  ok: number;
  count: number;
  error: string | null;
  fetched_at: string;
  duration_ms: number;
}

const toStatus = (row: RunRow): SourceStatus => ({
  source: row.source as JobSourceId,
  ok: row.ok === 1,
  count: row.count,
  error: row.error,
  fetchedAt: row.fetched_at,
  durationMs: row.duration_ms,
});

export function saveRun(status: SourceStatus): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO source_runs (source, ok, count, error, fetched_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      status.source,
      status.ok ? 1 : 0,
      status.count,
      status.error,
      status.fetchedAt,
      status.durationMs,
    );
}

export function getRun(source: string): SourceStatus | undefined {
  const row = getDb()
    .prepare('SELECT * FROM source_runs WHERE source = ?')
    .get(source) as RunRow | undefined;
  return row ? toStatus(row) : undefined;
}

export function getRuns(): SourceStatus[] {
  return (
    getDb()
      .prepare('SELECT * FROM source_runs ORDER BY source')
      .all() as RunRow[]
  ).map(toStatus);
}

export function countJobs() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const bySource = db
    .prepare(
      'SELECT source, COUNT(*) AS n FROM jobs WHERE expired = 0 AND duplicate_of IS NULL GROUP BY source',
    )
    .all() as { source: string; n: number }[];

  return {
    total: one('SELECT COUNT(*) AS n FROM jobs'),
    expired: one('SELECT COUNT(*) AS n FROM jobs WHERE expired = 1'),
    duplicates: one(
      'SELECT COUNT(*) AS n FROM jobs WHERE expired = 0 AND duplicate_of IS NOT NULL',
    ),
    visibleBySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
  };
}
