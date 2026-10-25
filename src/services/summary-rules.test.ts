import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JobSignals } from './job-signals';
import {
  factsFromTexts,
  reorderOriginalSummary,
  splitSentences,
  validateHeadline,
  validateSummary,
} from './summary-rules';

const ORIGINAL =
  'Full Stack Developer and AI Automation Engineer with 4+ years of experience designing, building, and shipping production-grade web applications and intelligent automation systems. ' +
  'Founder of Novba — an AI-powered SaaS finance platform for freelancers built with Next.js, Node.js, PostgreSQL, Stripe, and OpenAI. ' +
  'Hands-on experience building complex n8n workflows, SEO automation pipelines, and Supabase-backed data systems for international clients. ' +
  'Deep full-stack range across React, Node.js, TypeScript, and PostgreSQL, with a strong product mindset and a consistent record of delivering clean, scalable, user-focused software.';
const HEADLINE = 'Full Stack Developer · AI Automation Engineer · SaaS Founder';

const facts = factsFromTexts([ORIGINAL, HEADLINE], ORIGINAL, 'Novba');

const signals = (over: Partial<JobSignals>): JobSignals => ({
  focus: 'fullstack',
  aiHeavy: false,
  skills: new Set(),
  ...over,
});

describe('splitSentences', () => {
  it('does not split inside "Next.js" or "Node.js"', () => {
    assert.equal(splitSentences(ORIGINAL).length, 4);
  });
});

describe('validateSummary', () => {
  it('accepts the original summary', () => {
    assert.deepEqual(validateSummary(ORIGINAL, facts), []);
  });

  it('rejects technologies that are not in the resume', () => {
    const problems = validateSummary(
      `${ORIGINAL} Experienced with Kafka and Terraform for event-driven systems.`,
      facts,
    );
    assert.equal(problems.length, 1);
    assert.ok(
      problems[0].includes('Kafka') && problems[0].includes('Terraform'),
    );
  });

  it('rejects NestJS even though the scorer treats it as Node', () => {
    const problems = validateSummary(
      `${ORIGINAL} Hands-on with NestJS services.`,
      facts,
    );
    assert.ok(problems.some((p) => p.includes('NestJS')));
  });
  it('rejects filler wording that is not in the resume', () => {
    const problems = validateSummary(
      ORIGINAL.replace(
        'Deep full-stack range',
        'Proven expertise in full-stack range',
      ),
      facts,
    );
    assert.ok(
      problems.some((p) => p.includes('proven') && p.includes('expertise')),
    );
  });

  it('requires the founder mention', () => {
    const summary =
      'Full Stack Developer with 4+ years of experience building web applications with React, Node.js, TypeScript, and PostgreSQL. ' +
      'Experienced in automation pipelines and Supabase-backed data systems for international clients. ' +
      'Strong product mindset with a record of delivering clean, scalable software.';
    const problems = validateSummary(summary, facts);
    assert.equal(problems.length, 1);
    assert.ok(problems[0].includes('Novba'));
  });

  it('rejects a changed experience claim', () => {
    const problems = validateSummary(
      ORIGINAL.replace('4+ years', '7+ years'),
      facts,
    );
    assert.ok(problems.some((p) => p.includes('4+ years')));
  });

  it('rejects seniority the resume does not claim', () => {
    const problems = validateSummary(`Senior ${ORIGINAL}`, facts);
    assert.ok(problems.some((p) => p.includes('Senior')));
  });
});

describe('validateHeadline', () => {
  it('accepts a headline built from resume terms', () => {
    assert.deepEqual(validateHeadline(HEADLINE, facts), []);
  });

  it('rejects invented seniority and technologies', () => {
    assert.ok(
      validateHeadline('Senior Full Stack Developer', facts).length > 0,
    );
    assert.ok(
      validateHeadline('Full Stack Developer · Kubernetes', facts).length > 0,
    );
  });
});

describe('reorderOriginalSummary', () => {
  it('drops the least relevant sentence for a backend job and keeps the intro and founder lines', () => {
    const result = reorderOriginalSummary(
      ORIGINAL,
      signals({
        focus: 'backend',
        skills: new Set(['node', 'typescript', 'postgres']),
      }),
      facts,
    );
    assert.ok(
      result.startsWith('Full Stack Developer and AI Automation Engineer'),
    );
    assert.ok(result.includes('Novba'));
    assert.ok(result.includes('Deep full-stack'));
    assert.ok(!result.includes('n8n'));
    assert.equal(splitSentences(result).length, 3);
  });

  it('keeps the automation sentence for an AI-heavy job and puts the stack sentence first', () => {
    const result = reorderOriginalSummary(
      ORIGINAL,
      signals({
        aiHeavy: true,
        skills: new Set(['react', 'node', 'typescript', 'openai']),
      }),
      facts,
    );
    assert.ok(result.includes('n8n'));
    assert.ok(result.indexOf('Deep full-stack') < result.indexOf('Hands-on'));
  });

  it('leaves a short summary alone', () => {
    const short =
      'One sentence here. Two sentences here. Three sentences here.';
    assert.equal(reorderOriginalSummary(short, signals({}), facts), short);
  });
});
