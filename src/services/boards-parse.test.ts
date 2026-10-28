import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boardFromUrl,
  isWanted,
  normalizeAshby,
  normalizeGreenhouse,
  normalizeLever,
} from '../sources/boards-parse';

describe('boardFromUrl', () => {
  it('finds the company in apply links', () => {
    assert.deepEqual(
      boardFromUrl('https://boards.greenhouse.io/acme/jobs/123'),
      { ats: 'greenhouse', slug: 'acme' },
    );
    assert.deepEqual(boardFromUrl('https://job-boards.greenhouse.io/acme'), {
      ats: 'greenhouse',
      slug: 'acme',
    });
    assert.deepEqual(boardFromUrl('https://jobs.lever.co/spotify/abc/apply'), {
      ats: 'lever',
      slug: 'spotify',
    });
    assert.deepEqual(boardFromUrl('https://jobs.ashbyhq.com/Ramp/uuid'), {
      ats: 'ashby',
      slug: 'Ramp',
    });
    assert.equal(boardFromUrl('https://example.com/careers'), null);
    assert.equal(
      boardFromUrl('https://boards.greenhouse.io/embed/job_app'),
      null,
    );
  });
});

describe('board normalizers', () => {
  it('reads a Greenhouse job and decodes its encoded description', () => {
    const job = normalizeGreenhouse(
      {
        id: 127817,
        title: 'Senior Full-Stack Engineer',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/127817',
        location: { name: 'Remote - US' },
        first_published: '2026-10-20T10:00:00-05:00',
        content:
          '&lt;p&gt;Build things with &lt;strong&gt;Node.js&lt;/strong&gt; and React.&lt;/p&gt;',
      },
      { ats: 'greenhouse', slug: 'acme' },
    );
    assert.ok(job);
    assert.equal(job.id, 'ats:greenhouse:acme:127817');
    assert.equal(job.company, 'Acme');
    assert.equal(job.remoteType, 'remote');
    assert.equal(job.location, 'Remote - US');
    assert.equal(job.regionNote, 'Open to: US');
    assert.equal(job.postedAt, '2026-10-20T15:00:00.000Z');
    assert.ok(job.descriptionText.includes('Node.js'));
    assert.ok(!job.descriptionText.includes('&lt;'));
  });

  it('reads a Lever posting', () => {
    const job = normalizeLever(
      {
        id: 'abc-123',
        text: 'Backend Engineer',
        hostedUrl: 'https://jobs.lever.co/acme/abc-123',
        createdAt: 1787601815520,
        workplaceType: 'remote',
        categories: {
          commitment: 'Full Time',
          location: 'Berlin',
          allLocations: ['Berlin', 'Lisbon'],
        },
        descriptionPlain: 'We use Node and Postgres.',
        additionalPlain: 'Salary range 100k.',
      },
      { ats: 'lever', slug: 'acme', name: 'Acme Inc' },
    );
    assert.ok(job);
    assert.equal(job.company, 'Acme Inc');
    assert.equal(job.remoteType, 'remote');
    assert.equal(job.employmentType, 'Full Time');
    assert.equal(job.regionNote, 'Open to: Berlin');
    assert.equal(job.postedAt, new Date(1787601815520).toISOString());
    assert.ok(
      job.descriptionText.includes('Postgres') &&
        job.descriptionText.includes('Salary range'),
    );
  });

  it('reads an Ashby job with salary, and skips unlisted ones', () => {
    const base = {
      id: 'u1',
      title: 'Product Engineer',
      location: 'Remote (Europe)',
      isRemote: true,
      workplaceType: 'Remote',
      employmentType: 'FullTime',
      publishedAt: '2026-10-01T12:00:00.000+00:00',
      jobUrl: 'https://jobs.ashbyhq.com/acme/u1',
      descriptionPlain: 'Join us.',
      compensation: {
        compensationTierSummary: '$100K – $150K • Offers Equity',
      },
    };
    const board = { ats: 'ashby', slug: 'acme' } as const;
    const job = normalizeAshby({ ...base, isListed: true }, board);
    assert.ok(job);
    assert.equal(job.remoteType, 'remote');
    assert.equal(job.employmentType, 'Full time');
    assert.equal(job.salaryText, '$100K – $150K • Offers Equity');
    assert.equal(job.regionNote, 'Open to: Europe');
    assert.equal(normalizeAshby({ ...base, isListed: false }, board), null);
  });
});

describe('isWanted', () => {
  it('keeps remote engineering jobs only', () => {
    assert.equal(
      isWanted({ title: 'Senior Backend Engineer', remoteType: 'remote' }),
      true,
    );
    assert.equal(
      isWanted({ title: 'Account Executive', remoteType: 'remote' }),
      false,
    );
    assert.equal(
      isWanted({ title: 'Backend Engineer', remoteType: 'onsite' }),
      false,
    );
  });
});
