import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBoilerplateIndex, stripBoilerplate } from './job-boilerplate';
import { scoreJob } from './job-score';

const BLURB =
  'We hire developers experienced in React, Next.js, Node.js and TypeScript.';

const job = (id: string, company: string, title: string, own: string) => ({
  id,
  company,
  title,
  descriptionText: `${own}\n${BLURB}`,
});

const lemon = [
  job(
    '1',
    'Lemon.io',
    'Senior React Developer',
    'Build React apps for clients.',
  ),
  job(
    '2',
    'Lemon.io',
    'Senior Angular Developer',
    'Build Angular apps for clients.',
  ),
  job(
    '3',
    'lemon.io',
    'Senior .NET Developer',
    'Build .NET services for clients.',
  ),
];

describe('boilerplate detection', () => {
  it('removes text repeated under 3+ different titles of one company', () => {
    const index = buildBoilerplateIndex(lemon);
    const cleaned = stripBoilerplate(lemon[0], index);
    assert.ok(!cleaned.includes('Next.js'));
    assert.ok(cleaned.includes('Build React apps'));
  });

  it('does not treat one job cross-posted on several feeds as boilerplate', () => {
    const same = [
      job('1', 'Acme', 'Senior React Developer', 'Own the UI.'),
      job('2', 'Acme', 'Senior React Developer', 'Own the UI.'),
      job('3', 'Acme', 'Senior React Developer', 'Own the UI.'),
    ];
    const index = buildBoilerplateIndex(same);
    assert.equal(index.size, 0);
    assert.equal(stripBoilerplate(same[0], index), same[0].descriptionText);
  });

  it('leaves other companies untouched', () => {
    const other = job('9', 'Acme', 'Node Engineer', 'Build APIs.');
    const index = buildBoilerplateIndex([...lemon, other]);
    assert.ok(stripBoilerplate(other, index).includes('Next.js'));
  });

  it('keeps blurb skills out of an Angular job score and chips', () => {
    const profile = new Set(['react', 'next.js', 'node', 'typescript']);
    const target = lemon[1];
    const index = buildBoilerplateIndex(lemon);

    const before = scoreJob(target, profile);
    const after = scoreJob(
      { title: target.title, descriptionText: stripBoilerplate(target, index) },
      profile,
    );
    assert.ok(before.matched.length > 0);
    assert.equal(after.matched.length, 0);
  });

  it('catches shared text even with no line breaks or punctuation', () => {
    const blob = (id: string, title: string, own: string) => ({
      id,
      company: 'Lemon.io',
      title,
      descriptionText: `${own} Our developers work with React Next.js Node.js OpenAI React Native TypeScript every day across many startups`,
    });
    const jobs = [
      blob('1', 'Senior React Developer', 'Build React apps today'),
      blob('2', 'Senior Angular Developer', 'Build Angular apps today'),
      blob('3', 'Senior .NET Developer', 'Build .NET apps today'),
    ];
    const cleaned = stripBoilerplate(jobs[1], buildBoilerplateIndex(jobs));
    assert.ok(!cleaned.includes('TypeScript'));
    assert.ok(cleaned.includes('Angular'));
  });
});
