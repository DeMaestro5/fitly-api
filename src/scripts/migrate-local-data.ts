import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { closeDb, execute, migrate, query } from '../repo/db';
import { MasterResumeSchema } from '../schemas/resume.schema';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      'Usage: tsx src/scripts/migrate-local-data.ts <account-email>',
    );
  }

  await migrate();
  const [user] = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  if (!user) throw new Error(`No account for ${email}. Register it first.`);

  // 1. Master resume
  const resumePath = path.resolve(process.cwd(), 'data/master-resume.json');
  if (fs.existsSync(resumePath)) {
    const resume = MasterResumeSchema.parse(
      JSON.parse(fs.readFileSync(resumePath, 'utf8')),
    );
    await query(
      `INSERT INTO master_resumes (user_id, data) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = now()`,
      [user.id, JSON.stringify(resume)],
    );
    console.log('Master resume copied.');
  } else {
    console.log('No data/master-resume.json found, skipping resume.');
  }

  // 2. Job statuses and notes
  const sqlitePath = process.env.FITLY_DB_PATH
    ? path.resolve(process.env.FITLY_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'fitly.db');
  if (!fs.existsSync(sqlitePath)) {
    console.log('No SQLite database found, skipping job states.');
    return;
  }
  const sqlite = new Database(sqlitePath, { readonly: true });
  const rows = sqlite
    .prepare(
      `SELECT id, status, notes FROM jobs WHERE status != 'new' OR notes IS NOT NULL`,
    )
    .all() as { id: string; status: string; notes: string | null }[];
  sqlite.close();

  let copied = 0;
  for (const row of rows) {
    // Only jobs already in Postgres can be linked (the server's first refresh loads them).
    copied += await execute(
      `INSERT INTO job_states (user_id, job_id, status, notes)
       SELECT $1::uuid, $2::text, $3::text, $4::text
       WHERE EXISTS (SELECT 1 FROM jobs WHERE id = $2)
       ON CONFLICT (user_id, job_id) DO UPDATE SET status = excluded.status, notes = excluded.notes`,
      [user.id, row.id, row.status, row.notes],
    );
  }
  console.log(`Job states copied: ${copied} of ${rows.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
