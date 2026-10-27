import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeEntities,
  isFreshEnough,
  parseHiringPost,
  selectHiringThreads,
} from '../sources/hn-parse';

const POSTED = '2026-10-20T10:00:00.000Z';

const POST_A =
  'Acme Corp (YC W21) | Senior Backend Engineer | REMOTE (Worldwide) | Full-time | $150k-$190k' +
  '<p>We build payments infrastructure for freelancers. Stack: Node.js, TypeScript and PostgreSQL. Small team, fast shipping.' +
  '<p>Apply: <a href="https:&#x2F;&#x2F;boards.greenhouse.io&#x2F;acme&#x2F;jobs&#x2F;123" rel="nofollow">https:&#x2F;&#x2F;boards.greenhouse.io&#x2F;acme&#x2F;jobs&#x2F;12...</a> or email jobs [at] acme.com';

const POST_B =
  'Beta Labs | Founding Full-Stack Engineer | Remote (US only) | Contract' +
  '<p>We are a 5 person team building scheduling software. Send your resume to careers@betalabs.io and tell us what you built recently, we reply to everyone within a week.';

const POST_C =
  'Gamma GmbH | Backend Developer | ONSITE Berlin | Full-time' +
  '<p>We are a logistics software company with a team of forty engineers in Berlin. Daily work is Java and Kotlin services with a small amount of Node.js tooling.' +
  '<p>Send a short note and your CV to hiring@gamma.example';

const POST_E =
  'Delta | Remote | We are hiring' +
  '<p>Looking for a senior backend engineer to join our small team. We use Node and Postgres every day, and the whole company works asynchronously across time zones.' +
  '<p>Email jobs (at) delta (dot) dev to apply.';

const POST_TAGLINE =
  'Epsilon | Payments for developers | Senior Engineer | Remote' +
  '<p>We are building a payments platform and need engineers who like working close to customers. The team is small, remote first, and ships every day to production.';

const BODY =
  '<p>We are a small team building software for customers around the world. You will own features from idea to production and work closely with the founders every day.';

describe('parseHiringPost cleanup', () => {
  it('keeps links and locations out of the company name', () => {
    const hifi = parseHiringPost({
      id: 20,
      html:
        'HIFI Labs ( https://hifilabs.co ) | Senior Fullstack Engineer | San Francisco / Remote (PST) | Full-time' +
        BODY,
      postedAt: POSTED,
    });
    assert.ok(hifi);
    assert.equal(hifi.company, 'HIFI Labs');
    assert.equal(hifi.regionNote, 'Open to: San Francisco PST');

    const prairie = parseHiringPost({
      id: 21,
      html:
        'PrairieLearn (Remote US) | Full-Stack Software Engineer | Full-time' +
        BODY,
      postedAt: POSTED,
    });
    assert.ok(prairie);
    assert.equal(prairie.company, 'PrairieLearn');
    assert.equal(prairie.location, 'Remote US');
    assert.equal(prairie.regionNote, 'Open to: US');
  });

  it('drops the leftover "or" in a region note', () => {
    const job = parseHiringPost({
      id: 22,
      html:
        'All Gravy | Senior Software Engineer (Full-stack TypeScript) | REMOTE (European time zones) or ONSITE | Full-time' +
        BODY,
      postedAt: POSTED,
    });
    assert.ok(job);
    assert.equal(job.regionNote, 'Open to: European time zones');
  });

  it('cuts very long city lists at a word boundary', () => {
    const job = parseHiringPost({
      id: 23,
      html:
        'Rinse | Software Engineer | REMOTE (US or Canada) or San Francisco, Los Angeles, Chicago, Boston, New York City, New Jersey, Seattle, Austin, Toronto, Vancouver | Full-time' +
        BODY,
      postedAt: POSTED,
    });
    assert.ok(job && job.location && job.regionNote);
    assert.ok(job.location.length <= 121 && job.location.endsWith('…'));
    assert.ok(job.regionNote.startsWith('Open to: US or Canada'));
    assert.ok(job.regionNote.length <= 95 && job.regionNote.endsWith('…'));
  });
});

describe('decodeEntities', () => {
  it('decodes the entities HN puts in links', () => {
    assert.equal(
      decodeEntities('https:&#x2F;&#x2F;a.com&#x2F;x?a=1&amp;b=2'),
      'https://a.com/x?a=1&b=2',
    );
  });
});

describe('parseHiringPost', () => {
  it('reads a full pipe-separated post', () => {
    const job = parseHiringPost({ id: 4242, html: POST_A, postedAt: POSTED });
    assert.ok(job);
    assert.equal(job.id, 'hn:4242');
    assert.equal(job.source, 'hn');
    assert.equal(job.company, 'Acme Corp');
    assert.equal(job.title, 'Senior Backend Engineer');
    assert.equal(job.remoteType, 'remote');
    assert.equal(job.location, 'Worldwide');
    assert.equal(job.regionNote, null);
    assert.equal(job.employmentType, 'Full time');
    assert.equal(job.salaryText, '$150k-$190k');
    assert.equal(job.applyUrl, 'https://boards.greenhouse.io/acme/jobs/123');
    assert.equal(job.applyEmail, 'jobs@acme.com');
    assert.equal(job.sourceUrl, 'https://news.ycombinator.com/item?id=4242');
    assert.equal(job.postedAt, POSTED);
    assert.ok(job.descriptionText.includes('payments infrastructure'));
  });

  it('keeps a region restriction and falls back to the HN post for email-only jobs', () => {
    const job = parseHiringPost({ id: 7, html: POST_B, postedAt: POSTED });
    assert.ok(job);
    assert.equal(job.title, 'Founding Full-Stack Engineer');
    assert.equal(job.location, 'Remote (US only)');
    assert.equal(job.regionNote, 'Open to: US only');
    assert.equal(job.employmentType, 'Contract');
    assert.equal(job.applyEmail, 'careers@betalabs.io');
    assert.equal(job.applyUrl, job.sourceUrl);
  });

  it('reads on-site jobs', () => {
    const job = parseHiringPost({ id: 8, html: POST_C, postedAt: POSTED });
    assert.ok(job);
    assert.equal(job.title, 'Backend Developer');
    assert.equal(job.remoteType, 'onsite');
    assert.equal(job.regionNote, 'On-site: Berlin');
    assert.equal(job.applyEmail, 'hiring@gamma.example');
  });

  it('finds the role in the text when the header has none, and un-obfuscates emails', () => {
    const job = parseHiringPost({ id: 9, html: POST_E, postedAt: POSTED });
    assert.ok(job);
    assert.equal(job.company, 'Delta');
    assert.equal(job.title, 'Senior Backend Engineer');
    assert.equal(job.location, 'Remote');
    assert.equal(job.applyEmail, 'jobs@delta.dev');
  });

  it('does not mistake a company tagline for the role', () => {
    const job = parseHiringPost({
      id: 10,
      html: POST_TAGLINE,
      postedAt: POSTED,
    });
    assert.ok(job);
    assert.equal(job.title, 'Senior Engineer');
    assert.equal(job.location, 'Remote');
  });

  it('skips comments that are not job posts', () => {
    assert.equal(
      parseHiringPost({
        id: 11,
        html: '<p>Thanks for the thread, is anyone hiring in Lisbon?',
        postedAt: POSTED,
      }),
      null,
    );
  });
});

describe('thread helpers', () => {
  it('selects only "Who is hiring?" threads, newest first', () => {
    const hits = [
      { objectID: '1', title: 'Ask HN: Who wants to be hired? (October 2026)' },
      { objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)' },
      {
        objectID: '3',
        title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)',
      },
      { objectID: '4', title: 'Ask HN: Who is hiring? (September 2026)' },
      { objectID: '5', title: 'Ask HN: Who is hiring? (August 2026)' },
    ];
    assert.deepEqual(
      selectHiringThreads(hits, 2).map((h) => h.objectID),
      ['2', '4'],
    );
  });

  it('drops posts older than the age limit and keeps ones with unreadable dates', () => {
    const now = Date.parse('2026-10-24T00:00:00Z');
    assert.equal(isFreshEnough('2026-10-10T00:00:00Z', now, 30), true);
    assert.equal(isFreshEnough('2026-09-01T00:00:00Z', now, 30), false);
    assert.equal(isFreshEnough(null, now, 30), true);
    assert.equal(isFreshEnough('garbage', now, 30), true);
  });
});
