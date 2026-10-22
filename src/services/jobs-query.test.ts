import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { JobFilters } from '../repo/jobs.repo';
import type { SourceJob } from '../schemas/job.schema';

// Set BEFORE the db module loads, so the tests use a throwaway file.
const dbFile = path.join(os.tmpdir(), `fitly-test-${process.pid}.db`);
process.env.FITLY_DB_PATH = dbFile;

type RepoModule = typeof import('../repo/jobs.repo');
type DbModule = typeof import('../repo/db');
let repo: RepoModule;
let dbModule: DbModule;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function makeJob(n: number, over: Partial<SourceJob> = {}): SourceJob {
  return {
    id: `test:${n}`,
    source: 'himalayas',
    sourceUrl: `https://example.com/source/${n}`,
    applyUrl: `https://example.com/apply/${n}`,
    title: `Engineer ${n}`,
    company: `Company ${n}`,
    location: null,
    regionNote: null,
    remoteType: 'remote',
    employmentType: null,
    salaryText: null,
    tags: [],
    descriptionText: `Description ${n}`,
    postedAt: daysAgo(1),
    ...over,
  };
}

const seed: { job: SourceJob; score: number }[] = [
  {
    job: makeJob(1, {
      title: 'React Engineer',
      company: 'Acme',
      descriptionText: 'We use React and Stripe.',
    }),
    score: 90,
  },
  {
    job: makeJob(2, {
      title: 'Node Developer',
      company: 'Beta Corp',
      descriptionText: 'Node and Postgres.',
      postedAt: daysAgo(2),
    }),
    score: 90,
  },
  {
    job: makeJob(3, {
      title: 'Rust Engineer',
      company: 'Gamma',
      source: 'remoteok',
      location: 'Worldwide',
      postedAt: daysAgo(100),
    }),
    score: 40,
  },
  {
    job: makeJob(4, {
      title: 'Support Agent',
      company: 'Delta',
      source: 'wwr',
      regionNote: 'US only',
      postedAt: null,
    }),
    score: 5,
  },
  { job: makeJob(5, { title: 'Duplicate Engineer' }), score: 95 }, // marked duplicate below
  { job: makeJob(6, { title: 'Expired Engineer' }), score: 99 }, // marked expired below
  {
    job: makeJob(7, { title: '100% Remote Engineer', postedAt: daysAgo(3) }),
    score: 10,
  },
];

const base = { minScore: 0, sort: 'score' as const, page: 1, pageSize: 25 };
const ids = (extra: Partial<JobFilters> = {}) =>
  repo.listJobs({ ...base, ...extra }).items.map((job) => job.id);

describe('listJobs / getJob / updateJob', () => {
  before(async () => {
    dbModule = await import('../repo/db');
    repo = await import('../repo/jobs.repo');
    const db = dbModule.getDb();
    assert.ok(
      db.name.includes('fitly-test-'),
      `Refusing to run against ${db.name}`,
    );

    repo.upsertJobs(
      seed.map((s) => s.job),
      new Date().toISOString(),
    );
    repo.saveScores(
      seed.map((s) => ({ id: s.job.id, score: s.score, matched: [] })),
    );
    db.prepare('UPDATE jobs SET duplicate_of = ? WHERE id = ?').run(
      'test:1',
      'test:5',
    );
    db.prepare('UPDATE jobs SET expired = 1 WHERE id = ?').run('test:6');
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(
      'saved',
      'test:2',
    );
  });

  after(() => {
    dbModule.closeDb();
    for (const suffix of ['', '-wal', '-shm'])
      fs.rmSync(dbFile + suffix, { force: true });
  });

  it('hides expired and duplicate jobs', () => {
    const all = ids();
    assert.ok(!all.includes('test:5'), 'duplicate hidden');
    assert.ok(!all.includes('test:6'), 'expired hidden');
    assert.equal(all.length, 5);
  });

  it('sorts by score, then newest, then id', () => {
    assert.deepEqual(ids(), ['test:1', 'test:2', 'test:3', 'test:7', 'test:4']);
  });

  it('sort=posted puts the newest first (unreadable dates fall back to first seen)', () => {
    assert.deepEqual(ids({ sort: 'posted' }), [
      'test:4',
      'test:1',
      'test:2',
      'test:7',
      'test:3',
    ]);
  });

  it('search needs every word, in title, company or description, any case', () => {
    assert.deepEqual(ids({ q: 'react acme' }), ['test:1']);
    assert.deepEqual(ids({ q: 'STRIPE' }), ['test:1']);
    assert.deepEqual(ids({ q: 'node beta' }), ['test:2']);
    assert.deepEqual(ids({ q: 'react beta' }), []);
  });

  it('treats % and SQL text in the search as plain text', () => {
    assert.deepEqual(ids({ q: '100%' }), ['test:7']);
    assert.deepEqual(ids({ q: "'; DROP TABLE jobs; --" }), []);
    assert.equal(ids().length, 5, 'the table is still there');
  });

  it('filters by source, status, minScore, scope and sinceDays', () => {
    assert.deepEqual(ids({ source: 'remoteok' }), ['test:3']);
    assert.deepEqual(ids({ status: 'saved' }), ['test:2']);
    assert.deepEqual(ids({ minScore: 50 }), ['test:1', 'test:2']);
    assert.deepEqual(ids({ scope: 'worldwide' }), ['test:3']);
    assert.deepEqual(ids({ scope: 'limited' }), ['test:4']);
    assert.deepEqual(ids({ scope: 'unknown' }), ['test:1', 'test:2', 'test:7']);
    assert.deepEqual(ids({ sinceDays: 7 }), [
      'test:1',
      'test:2',
      'test:7',
      'test:4',
    ]);
  });

  it('paginates and reports the total', () => {
    const page2 = repo.listJobs({ ...base, pageSize: 2, page: 2 });
    assert.equal(page2.total, 5);
    assert.deepEqual(
      page2.items.map((j) => j.id),
      ['test:3', 'test:7'],
    );
    assert.deepEqual(ids({ pageSize: 2, page: 3 }), ['test:4']);
  });

  it('list items leave out the description; getJob includes it', () => {
    const item = repo.listJobs({ ...base }).items[0];
    assert.equal('descriptionText' in item, false);
    assert.equal(
      repo.getJob('test:1')?.descriptionText,
      'We use React and Stripe.',
    );
    assert.equal(repo.getJob('nope'), undefined);
  });

  it('updateJob changes only status and notes', () => {
    const updated = repo.updateJob('test:4', {
      status: 'applied',
      notes: 'Emailed the founder',
    });
    assert.equal(updated?.status, 'applied');
    assert.equal(updated?.notes, 'Emailed the founder');
    assert.equal(updated?.title, 'Support Agent');
    assert.equal(updated?.score, 5);

    assert.equal(repo.updateJob('nope', { status: 'saved' }), undefined);
    assert.equal(repo.updateJob('test:4', {})?.notes, 'Emailed the founder');
    assert.equal(repo.updateJob('test:4', { notes: null })?.notes, null);
  });
});
