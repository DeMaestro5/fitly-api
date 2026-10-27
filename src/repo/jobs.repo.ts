import type {
  JobSourceId,
  SourceJob,
  JobStatus,
  RemoteType,
} from '../schemas/job.schema';
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
      id, source, source_url, apply_url, apply_email, title, company, location, region_note, remote_type,
      employment_type, salary_text, tags, description_text, posted_at,
      first_seen_at, last_seen_at, dedupe_key
    ) VALUES (
      @id, @source, @sourceUrl, @applyUrl, @applyEmail, @title, @company, @location, @regionNote, @remoteType,
      @employmentType, @salaryText, @tags, @descriptionText, @postedAt,
      @seenAt, @seenAt, @dedupeKey
    )
    ON CONFLICT(id) DO UPDATE SET
      source_url = excluded.source_url,
      apply_url = excluded.apply_url,
      apply_email = excluded.apply_email,
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
        applyEmail: job.applyEmail ?? null, // adapters that have no email leave it out
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
      `SELECT id, source, company, title, salary_text AS salaryText,
              length(description_text) AS descLength
       FROM jobs WHERE expired = 0`,
    )
    .all() as (Omit<DedupeRow, 'dedupeKey'> & {
    company: string;
    title: string;
  })[];

  const assignments = assignDuplicates(
    rows.map((r) => ({
      ...r,
      dedupeKey: dedupeKey({ company: r.company, title: r.title }),
    })),
  );
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

export interface JobForScoring {
  id: string;
  source: JobSourceId;
  title: string;
  company: string;
  tags: string[];
  descriptionText: string;
}

export function listJobsForScoring(): JobForScoring[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, source, title, company, tags, description_text AS descriptionText
       FROM jobs
       WHERE expired = 0`,
    )
    .all() as {
    id: string;
    source: string;
    title: string;
    company: string;
    tags: string;
    descriptionText: string;
  }[];

  return rows.map((r) => {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(r.tags);
      if (Array.isArray(parsed)) tags = parsed;
    } catch {
      tags = [];
    }
    return {
      id: r.id,
      source: r.source as JobSourceId,
      title: r.title,
      company: r.company,
      tags,
      descriptionText: r.descriptionText ?? '',
    };
  });
}

export interface JobScoreEntry {
  id: string;
  score: number;
  matched: string[];
}

export function saveScores(entries: JobScoreEntry[]): void {
  const db = getDb();
  const update = db.prepare(
    'UPDATE jobs SET score = ?, matched = ? WHERE id = ?',
  );

  db.transaction((items: JobScoreEntry[]) => {
    for (const item of items) {
      update.run(item.score, JSON.stringify(item.matched), item.id);
    }
  })(entries);
}

export type JobScope = 'worldwide' | 'limited' | 'unknown';

export interface JobFilters {
  q?: string;
  source?: JobSourceId;
  status?: JobStatus;
  minScore: number;
  sinceDays?: number;
  scope?: JobScope;
  sort: 'score' | 'posted';
  page: number;
  pageSize: number;
}

export interface JobListItem {
  id: string;
  source: JobSourceId;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  company: string;
  location: string | null;
  regionNote: string | null;
  remoteType: RemoteType;
  employmentType: string | null;
  salaryText: string | null;
  tags: string[];
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  score: number;
  matched: string[];
  status: JobStatus;
  notes: string | null;
  expired: boolean;
  duplicateOf: string | null;
  applyEmail: string | null;
}

// The list leaves out the description (it is big); the detail view includes it.
export interface JobDetail extends JobListItem {
  descriptionText: string;
}

export interface JobListResults {
  items: JobListItem[];
  total: number;
}

export interface JobPatch {
  status?: JobStatus;
  notes?: string | null;
}

interface JobRow {
  id: string;
  source: string;
  source_url: string;
  apply_url: string;
  title: string;
  company: string;
  location: string | null;
  region_note: string | null;
  remote_type: string;
  employment_type: string;
  salary_text: string | null;
  tags: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  score: number | null;
  matched: string | null;
  status: string | null;
  notes: string | null;
  expired: number;
  duplicate_of: string | null;
  description_text?: string | null;
  apply_email: string | null;
}

const LIST_COLUMNS = `id, source, source_url, apply_url, apply_email, title, company, location, region_note,
remote_type, employment_type, salary_text, tags, posted_at, first_seen_at, 
last_seen_at, score, matched, status, notes, expired, duplicate_of`;

// Feeds publish dates in different formats. datetime() understands ISO dates and gives NULL
// for anything else, so unreadable dates fall back to the day we first saw the job.
const POSTED_SQL = `coalesce(datetime(posted_at), datetime(first_seen_at))`;

// Column names come from this whitelist, never from the request.
const ORDER_SQL = {
  score: `score DESC, ${POSTED_SQL} DESC, id ASC`,
  posted: `${POSTED_SQL} DESC, score DESC, id ASC`,
} as const;

const REGION_TEXT = `lower(coalesce(region_note, '') || ' ' || coalesce(location, ''))`;
const WORLDWIDE_SQL = `(${REGION_TEXT} LIKE '%worldwide%' OR ${REGION_TEXT} LIKE '%anywhere%' OR ${REGION_TEXT} LIKE '%global%')`;
const HAS_REGION_NOTE_SQL = `(trim(coalesce(region_note, '')) != '')`;
const SCOPE_SQL: Record<JobScope, string> = {
  worldwide: WORLDWIDE_SQL,
  limited: `(${HAS_REGION_NOTE_SQL} AND NOT ${WORLDWIDE_SQL})`,
  unknown: `(NOT ${WORLDWIDE_SQL} AND NOT ${HAS_REGION_NOTE_SQL})`,
};

function parseStringArray(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

function toJobListItem(row: JobRow): JobListItem {
  return {
    id: row.id,
    source: row.source as JobSourceId,
    sourceUrl: row.source_url,
    applyUrl: row.apply_url,
    title: row.title,
    company: row.company,
    location: row.location,
    regionNote: row.region_note,
    remoteType: row.remote_type as RemoteType,
    employmentType: row.employment_type,
    salaryText: row.salary_text,
    tags: parseStringArray(row.tags),
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    score: row.score ?? 0,
    matched: parseStringArray(row.matched),
    status: row.status as JobStatus,
    notes: row.notes,
    expired: row.expired === 1,
    duplicateOf: row.duplicate_of,
    applyEmail: row.apply_email,
  };
}

// In LIKE, % and _ are wildcards. Escape them so searching "100%" means the text "100%".
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

// Every word must match somewhere (title, company or description): "react stripe" = both.
function searchWords(q: string | undefined): string[] {
  return (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
}

export function listJobs(filters: JobFilters): JobListResults {
  // Expired and duplicate rows are never shown in the list.
  const where: string[] = ['expired = 0', 'duplicate_of IS NULL'];
  const params: (string | number)[] = [];

  for (const word of searchWords(filters.q)) {
    const like = `%${escapeLike(word)}%`;
    where.push(
      `(title LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR description_text LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.minScore > 0) {
    where.push('score >= ?');
    params.push(filters.minScore);
  }
  if (filters.sinceDays) {
    where.push(`${POSTED_SQL} >= datetime('now', ?)`);
    params.push(`-${filters.sinceDays} days`);
  }
  if (filters.scope) where.push(SCOPE_SQL[filters.scope]);

  const whereSql = where.join(' AND ');
  const db = getDb();

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM jobs WHERE ${whereSql}`)
      .get(...params) as {
      n: number;
    }
  ).n;

  const rows = db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM jobs WHERE ${whereSql}
       ORDER BY ${ORDER_SQL[filters.sort]} LIMIT ? OFFSET ?`,
    )
    .all(
      ...params,
      filters.pageSize,
      (filters.page - 1) * filters.pageSize,
    ) as JobRow[];

  return { items: rows.map(toJobListItem), total };
}

export function getJob(id: string): JobDetail | undefined {
  const row = getDb()
    .prepare(`SELECT ${LIST_COLUMNS}, description_text FROM jobs WHERE id = ?`)
    .get(id) as JobRow | undefined;
  return row
    ? { ...toJobListItem(row), descriptionText: row.description_text ?? '' }
    : undefined;
}

export function updateJob(id: string, patch: JobPatch): JobDetail | undefined {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    params.push(patch.notes);
  }
  if (sets.length === 0) return getJob(id);

  const result = getDb()
    .prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params, id);

  return result.changes === 0 ? undefined : getJob(id);
}
