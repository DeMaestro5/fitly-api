import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 2;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  apply_url        TEXT NOT NULL,
  title            TEXT NOT NULL,
  company          TEXT NOT NULL,
  location         TEXT,
  region_note      TEXT,
  remote_type      TEXT NOT NULL,
  employment_type  TEXT,
  salary_text      TEXT,
  tags             TEXT NOT NULL,
  description_text TEXT NOT NULL,
  posted_at        TEXT,
  first_seen_at    TEXT NOT NULL,
  last_seen_at     TEXT NOT NULL,
  expired          INTEGER NOT NULL DEFAULT 0,
  score            INTEGER NOT NULL DEFAULT 0,
  matched          TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'new',
  notes            TEXT,
  dedupe_key       TEXT NOT NULL,
  duplicate_of     TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs (posted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_dedupe ON jobs (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs (source);

CREATE TABLE IF NOT EXISTS source_runs (
  source      TEXT PRIMARY KEY,
  ok          INTEGER NOT NULL,
  count       INTEGER NOT NULL,
  error       TEXT,
  fetched_at  TEXT NOT NULL,
  duration_ms INTEGER NOT NULL
);
`;
const MIGRATION_V2 = `ALTER TABLE jobs ADD COLUMN apply_email TEXT;`;

let db: Database.Database | null = null;

// The version number can get ahead of the real table (for example when a server restarts
// halfway through an edit), so look at the actual columns.
function hasColumn(
  database: Database.Database,
  table: string,
  column: string,
): boolean {
  const columns = database.pragma(`table_info(${table})`) as { name: string }[];
  return columns.some((c) => c.name === column);
}

function migrate(database: Database.Database): void {
  const current = database.pragma('user_version', { simple: true }) as number;
  if (current < 1) database.exec(SCHEMA_V1);
  if (!hasColumn(database, 'jobs', 'apply_email')) database.exec(MIGRATION_V2);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}
export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.FITLY_DB_PATH
    ? path.resolve(process.env.FITLY_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'fitly.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
