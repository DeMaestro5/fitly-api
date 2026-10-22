import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ListJobsQuerySchema,
  PatchJobBodySchema,
  RefreshQuerySchema,
} from '../schemas/jobs-api.schema';

describe('jobs API schemas', () => {
  it('list query: applies defaults and turns text numbers into numbers', () => {
    const empty = ListJobsQuerySchema.parse({});
    assert.equal(empty.minScore, 0);
    assert.equal(empty.sort, 'score');
    assert.equal(empty.page, 1);
    assert.equal(empty.pageSize, 25);

    const q = ListJobsQuerySchema.parse({
      minScore: '50',
      page: '2',
      pageSize: '10',
      sinceDays: '7',
    });
    assert.equal(q.minScore, 50);
    assert.equal(q.page, 2);
    assert.equal(q.pageSize, 10);
    assert.equal(q.sinceDays, 7);
  });

  it('list query: rejects bad values', () => {
    for (const bad of [
      { status: 'bogus' },
      { source: 'linkedin' },
      { pageSize: '1000' },
      { minScore: '101' },
      { page: '0' },
      { scope: 'mars' },
    ]) {
      assert.equal(
        ListJobsQuerySchema.safeParse(bad).success,
        false,
        JSON.stringify(bad),
      );
    }
  });

  it('patch: only status and notes are accepted', () => {
    assert.equal(
      PatchJobBodySchema.safeParse({ status: 'saved' }).success,
      true,
    );
    assert.equal(PatchJobBodySchema.safeParse({ notes: null }).success, true);
    assert.equal(PatchJobBodySchema.safeParse({}).success, false);
    assert.equal(PatchJobBodySchema.safeParse({ score: 100 }).success, false);
    assert.equal(
      PatchJobBodySchema.safeParse({ status: 'maybe' }).success,
      false,
    );
  });

  it('refresh query: force=false really means false', () => {
    assert.equal(RefreshQuerySchema.parse({}).force, false);
    assert.equal(RefreshQuerySchema.parse({ force: 'false' }).force, false);
    assert.equal(RefreshQuerySchema.parse({ force: 'true' }).force, true);
    assert.equal(RefreshQuerySchema.safeParse({ force: 'yes' }).success, false);
  });
});
