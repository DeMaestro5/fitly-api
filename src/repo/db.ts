import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';

const SCHEMA_V1 = `
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id  uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);

CREATE TABLE master_resumes (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id               text PRIMARY KEY,
  source           text NOT NULL,
  source_url       text NOT NULL,
  apply_url        text NOT NULL,
  apply_email      text,
  title            text NOT NULL,
  company          text NOT NULL,
  location         text,
  region_note      text,
  remote_type      text NOT NULL,
  employment_type  text,
  salary_text      text,
  tags             text NOT NULL,
  description_text text NOT NULL,
  posted_at        text,
  posted_ts        timestamptz,
  first_seen_at    timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL,
  expired          boolean NOT NULL DEFAULT false,
  dedupe_key       text NOT NULL,
  duplicate_of     text
);
CREATE INDEX idx_jobs_posted ON jobs (posted_ts);
CREATE INDEX idx_jobs_dedupe ON jobs (dedupe_key);
CREATE INDEX idx_jobs_source ON jobs (source);

CREATE TABLE job_scores (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id  text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score   integer NOT NULL,
  matched text NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE job_states (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'new',
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX idx_job_states_job ON job_states (job_id);

CREATE TABLE source_runs (
  source      text PRIMARY KEY,
  ok          boolean NOT NULL,
  count       integer NOT NULL,
  error       text,
  fetched_at  timestamptz NOT NULL,
  duration_ms integer NOT NULL
);
`;

const MIGRATIONS: { id: number; sql: string }[] = [{ id: 1, sql: SCHEMA_V1 }];

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err));
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

// For INSERT/UPDATE/DELETE where only the number of affected rows matters.
export async function execute(
  text: string,
  params: unknown[] = [],
): Promise<number> {
  const result = await getPool().query(text, params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id integer PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ id: number }>(
      'SELECT id FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          migration.id,
        ]);
        await client.query('COMMIT');
        console.log(`[db] applied migration ${migration.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(727274)')
      .catch(() => undefined);
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
