import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignDuplicates, dedupeKey, type DedupeRow } from './job-dedupe';

const row = (
  id: string,
  source: DedupeRow['source'],
  extra: Partial<DedupeRow> = {},
): DedupeRow => ({
  id,
  source,
  salaryText: null,
  descLength: 1000,
  dedupeKey: 'acme|engineer',
  ...extra,
});

describe('dedupeKey', () => {
  it('ignores case, company suffixes, gender and remote markers', () => {
    assert.equal(
      dedupeKey({
        company: 'Acme GmbH',
        title: 'Senior Software Engineer (m/f/d)',
      }),
      dedupeKey({ company: 'ACME', title: 'Sr. Software Engineer - Remote' }),
    );
  });

  it('keeps different roles apart', () => {
    assert.notEqual(
      dedupeKey({ company: 'Acme', title: 'Backend Engineer' }),
      dedupeKey({ company: 'Acme', title: 'Frontend Engineer' }),
    );
  });
});

describe('assignDuplicates', () => {
  it('links cross-source copies to the best one', () => {
    const map = assignDuplicates([
      row('a', 'arbeitnow'),
      row('b', 'himalayas'),
      row('c', 'remoteok'),
    ]);
    assert.equal(map.get('a'), 'b');
    assert.equal(map.get('c'), 'b');
    assert.equal(map.has('b'), false);
  });

  it('prefers the copy that has a salary', () => {
    const map = assignDuplicates([
      row('a', 'himalayas'),
      row('b', 'remoteok', { salaryText: 'USD 100,000 / year' }),
    ]);
    assert.equal(map.get('a'), 'b');
  });

  it('leaves a group alone when one source appears twice', () => {
    const map = assignDuplicates([
      row('a1', 'jobicy'),
      row('a2', 'jobicy'),
      row('b', 'himalayas'),
    ]);
    assert.equal(map.size, 0);
  });

  it('ignores rows with an empty company or title', () => {
    const map = assignDuplicates([
      row('a', 'jobicy', { dedupeKey: '|engineer' }),
      row('b', 'wwr', { dedupeKey: '|engineer' }),
    ]);
    assert.equal(map.size, 0);
  });
});
