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
import { execute, query, withTransaction } from './db';

export interface UpsertResult {
  inserted: number;
  updated: number;
}

// Feeds publish dates in many formats; keep a clean timestamp for sorting and filtering.
function toTimestamp(text: string | null | undefined): string | null {
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// Source facts are refreshed on every fetch; per-user status, notes and score live in other tables.
export async function upsertJobs(
  jobs: SourceJob[],
  seenAt: string,
): Promise<UpsertResult> {
  return withTransaction(async (client) => {
    let inserted = 0;
    let updated = 0;

    for (const job of jobs) {
      const result = await client.query<{ inserted: boolean }>(
        `INSERT INTO jobs (
           id, source, source_url, apply_url, apply_email, title, company, location,
           region_note, remote_type, employment_type, salary_text, tags, description_text,
           posted_at, posted_ts, first_seen_at, last_seen_at, dedupe_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17, $18
         )
         ON CONFLICT (id) DO UPDATE SET
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
           posted_ts = excluded.posted_ts,
           last_seen_at = excluded.last_seen_at,
           expired = false,
           dedupe_key = excluded.dedupe_key
         RETURNING (xmax = 0) AS inserted`,
        [
          job.id,
          job.source,
          job.sourceUrl,
          job.applyUrl,
          job.applyEmail ?? null,
          job.title,
          job.company,
          job.location ?? null,
          job.regionNote ?? null,
          job.remoteType,
          job.employmentType ?? null,
          job.salaryText ?? null,
          JSON.stringify(job.tags),
          job.descriptionText,
          job.postedAt ?? null,
          toTimestamp(job.postedAt),
          seenAt,
          dedupeKey(job),
        ],
      );
      if (result.rows[0]?.inserted) inserted++;
      else updated++;
    }

    return { inserted, updated };
  });
}

// Feeds only show a window of recent jobs, so "not seen for a while" is how we expire them.
export async function markStale(cutoffIso: string): Promise<number> {
  return execute(
    'UPDATE jobs SET expired = true WHERE expired = false AND last_seen_at < $1',
    [cutoffIso],
  );
}

export async function recomputeDuplicates(): Promise<number> {
  const rows = await query<
    Omit<DedupeRow, 'dedupeKey'> & { company: string; title: string }
  >(
    `SELECT id, source, company, title, salary_text AS "salaryText",
            length(description_text) AS "descLength"
     FROM jobs WHERE expired = false`,
  );

  const assignments = assignDuplicates(
    rows.map((r) => ({
      ...r,
      dedupeKey: dedupeKey({ company: r.company, title: r.title }),
    })),
  );

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE jobs SET duplicate_of = NULL WHERE duplicate_of IS NOT NULL',
    );
    if (assignments.size > 0) {
      await client.query(
        `UPDATE jobs j SET duplicate_of = v.canon
         FROM unnest($1::text[], $2::text[]) AS v(id, canon)
         WHERE j.id = v.id`,
        [[...assignments.keys()], [...assignments.values()]],
      );
    }
  });

  return assignments.size;
}

interface RunRow {
  source: string;
  ok: boolean;
  count: number;
  error: string | null;
  fetched_at: Date;
  duration_ms: number;
}

const toStatus = (row: RunRow): SourceStatus => ({
  source: row.source as JobSourceId,
  ok: row.ok,
  count: row.count,
  error: row.error,
  fetchedAt: row.fetched_at.toISOString(),
  durationMs: row.duration_ms,
});

export async function saveRun(status: SourceStatus): Promise<void> {
  await query(
    `INSERT INTO source_runs (source, ok, count, error, fetched_at, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source) DO UPDATE SET
       ok = excluded.ok,
       count = excluded.count,
       error = excluded.error,
       fetched_at = excluded.fetched_at,
       duration_ms = excluded.duration_ms`,
    [
      status.source,
      status.ok,
      status.count,
      status.error,
      status.fetchedAt,
      status.durationMs,
    ],
  );
}

export async function getRun(
  source: string,
): Promise<SourceStatus | undefined> {
  const rows = await query<RunRow>(
    'SELECT * FROM source_runs WHERE source = $1',
    [source],
  );
  return rows[0] ? toStatus(rows[0]) : undefined;
}

export async function getRuns(): Promise<SourceStatus[]> {
  const rows = await query<RunRow>('SELECT * FROM source_runs ORDER BY source');
  return rows.map(toStatus);
}

export async function countJobs() {
  const one = async (sql: string) => (await query<{ n: number }>(sql))[0].n;
  const bySource = await query<{ source: string; n: number }>(
    `SELECT source, COUNT(*)::int AS n FROM jobs
     WHERE expired = false AND duplicate_of IS NULL GROUP BY source`,
  );

  return {
    total: await one('SELECT COUNT(*)::int AS n FROM jobs'),
    expired: await one(
      'SELECT COUNT(*)::int AS n FROM jobs WHERE expired = true',
    ),
    duplicates: await one(
      'SELECT COUNT(*)::int AS n FROM jobs WHERE expired = false AND duplicate_of IS NOT NULL',
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

export async function listJobsForScoring(): Promise<JobForScoring[]> {
  const rows = await query<{
    id: string;
    source: string;
    title: string;
    company: string;
    tags: string;
    descriptionText: string;
  }>(
    `SELECT id, source, title, company, tags, description_text AS "descriptionText"
     FROM jobs WHERE expired = false`,
  );

  return rows.map((r) => ({
    id: r.id,
    source: r.source as JobSourceId,
    title: r.title,
    company: r.company,
    tags: parseStringArray(r.tags),
    descriptionText: r.descriptionText ?? '',
  }));
}

export interface JobScoreEntry {
  id: string;
  score: number;
  matched: string[];
}

// Scores belong to one user: they are measured against that user's master resume.
export async function saveScores(
  userId: string,
  entries: JobScoreEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await query(
    `INSERT INTO job_scores (user_id, job_id, score, matched)
     SELECT $1::uuid, v.job_id, v.score, v.matched
     FROM unnest($2::text[], $3::int[], $4::text[]) AS v(job_id, score, matched)
     ON CONFLICT (user_id, job_id) DO UPDATE SET
       score = excluded.score, matched = excluded.matched`,
    [
      userId,
      entries.map((e) => e.id),
      entries.map((e) => e.score),
      entries.map((e) => JSON.stringify(e.matched)),
    ],
  );
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
  apply_email: string | null;
  title: string;
  company: string;
  location: string | null;
  region_note: string | null;
  remote_type: string;
  employment_type: string | null;
  salary_text: string | null;
  tags: string | null;
  posted_at: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  expired: boolean;
  duplicate_of: string | null;
  score: number;
  matched: string | null;
  status: string;
  notes: string | null;
  description_text?: string | null;
}

// Jobs are shared; status, notes and score are this user's (empty means "new" / 0).
const FROM_SQL = `FROM jobs j
  LEFT JOIN job_states s ON s.job_id = j.id AND s.user_id = $1
  LEFT JOIN job_scores sc ON sc.job_id = j.id AND sc.user_id = $1`;

const SCORE_SQL = `coalesce(sc.score, 0)`;
const STATUS_SQL = `coalesce(s.status, 'new')`;

const LIST_COLUMNS = `j.id, j.source, j.source_url, j.apply_url, j.apply_email, j.title, j.company,
  j.location, j.region_note, j.remote_type, j.employment_type, j.salary_text, j.tags, j.posted_at,
  j.first_seen_at, j.last_seen_at, j.expired, j.duplicate_of,
  ${SCORE_SQL} AS score, coalesce(sc.matched, '[]') AS matched,
  ${STATUS_SQL} AS status, s.notes AS notes`;

// Unreadable dates fall back to the day we first saw the job.
const POSTED_SQL = `coalesce(j.posted_ts, j.first_seen_at)`;

// Column names come from this whitelist, never from the request.
const ORDER_SQL = {
  score: `${SCORE_SQL} DESC, ${POSTED_SQL} DESC, j.id ASC`,
  posted: `${POSTED_SQL} DESC, ${SCORE_SQL} DESC, j.id ASC`,
} as const;

const REGION_TEXT = `lower(coalesce(j.region_note, '') || ' ' || coalesce(j.location, ''))`;
const WORLDWIDE_SQL = `(${REGION_TEXT} LIKE '%worldwide%' OR ${REGION_TEXT} LIKE '%anywhere%' OR ${REGION_TEXT} LIKE '%global%')`;
const HAS_REGION_NOTE_SQL = `(trim(coalesce(j.region_note, '')) != '')`;
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
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    score: row.score,
    matched: parseStringArray(row.matched),
    status: row.status as JobStatus,
    notes: row.notes,
    expired: row.expired,
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

export async function listJobs(
  userId: string,
  filters: JobFilters,
): Promise<JobListResults> {
  const params: unknown[] = [userId]; // $1 is always the user
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Expired and duplicate rows are never shown in the list.
  const where: string[] = ['j.expired = false', 'j.duplicate_of IS NULL'];

  for (const word of searchWords(filters.q)) {
    const p = bind(`%${escapeLike(word)}%`);
    where.push(
      `(j.title ILIKE ${p} OR j.company ILIKE ${p} OR j.description_text ILIKE ${p})`,
    );
  }
  if (filters.source) where.push(`j.source = ${bind(filters.source)}`);
  if (filters.status) where.push(`${STATUS_SQL} = ${bind(filters.status)}`);
  if (filters.minScore > 0)
    where.push(`${SCORE_SQL} >= ${bind(filters.minScore)}`);
  if (filters.sinceDays)
    where.push(
      `${POSTED_SQL} >= now() - (${bind(filters.sinceDays)}::int * interval '1 day')`,
    );
  if (filters.scope) where.push(SCOPE_SQL[filters.scope]);

  const whereSql = where.join(' AND ');

  const total = (
    await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n ${FROM_SQL} WHERE ${whereSql}`,
      params,
    )
  )[0].n;

  const limit = bind(filters.pageSize);
  const offset = bind((filters.page - 1) * filters.pageSize);
  const rows = await query<JobRow>(
    `SELECT ${LIST_COLUMNS} ${FROM_SQL} WHERE ${whereSql}
     ORDER BY ${ORDER_SQL[filters.sort]} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { items: rows.map(toJobListItem), total };
}

export async function getJob(
  userId: string,
  id: string,
): Promise<JobDetail | undefined> {
  const rows = await query<JobRow>(
    `SELECT ${LIST_COLUMNS}, j.description_text ${FROM_SQL} WHERE j.id = $2`,
    [userId, id],
  );
  const row = rows[0];
  return row
    ? { ...toJobListItem(row), descriptionText: row.description_text ?? '' }
    : undefined;
}

export async function updateJob(
  userId: string,
  id: string,
  patch: JobPatch,
): Promise<JobDetail | undefined> {
  const exists = await query('SELECT 1 FROM jobs WHERE id = $1', [id]);
  if (exists.length === 0) return undefined;
  if (patch.status === undefined && patch.notes === undefined)
    return getJob(userId, id);

  // Only the fields present in the patch are overwritten on conflict.
  const sets = ['updated_at = now()'];
  if (patch.status !== undefined) sets.push('status = excluded.status');
  if (patch.notes !== undefined) sets.push('notes = excluded.notes');

  await query(
    `INSERT INTO job_states (user_id, job_id, status, notes)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (user_id, job_id) DO UPDATE SET ${sets.join(', ')}`,
    [userId, id, patch.status ?? 'new', patch.notes ?? null],
  );

  return getJob(userId, id);
}
