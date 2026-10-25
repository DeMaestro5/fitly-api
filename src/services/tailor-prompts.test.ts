import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTailorPrompt } from '../prompts/tailor-prompts';
import { checkTailored } from './guardrail';

const base = { experience: [], projects: [], skills: [] };

describe('tailoring prompt and guardrail after the summary split', () => {
  it('never sends the headline or summary to the model', () => {
    const { system, user } = buildTailorPrompt(
      { ...base, headline: 'SECRET-HEADLINE', summary: 'SECRET-SUMMARY' },
      'job text',
    );
    assert.ok(!user.includes('SECRET-HEADLINE'));
    assert.ok(!user.includes('SECRET-SUMMARY'));
    assert.ok(!/summary/i.test(system.replace('a summary', '')));
  });

  it('no longer judges the summary or headline (the summary service does)', () => {
    const findings = checkTailored(
      { ...base, summary: 'Original one. Original two.' },
      {
        ...base,
        summary: 'Brand new text with 99 Kafka things.',
        headline: 'Kafka Guru',
      },
      'job description',
    );
    assert.deepEqual(findings, []);
  });
});
