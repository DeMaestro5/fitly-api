import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getJobSignals } from './job-signals';

const posting = (
  title: string | null,
  required: string[] = [],
  preferred: string[] = [],
) => ({
  title,
  requirements:
    required.length > 0 || preferred.length > 0
      ? { required, preferred }
      : null,
  text: '',
});

describe('getJobSignals', () => {
  it('reads the focus from the title first', () => {
    assert.equal(
      getJobSignals(posting('Senior Backend Developer (Node.js / Nest.js)'))
        .focus,
      'backend',
    );
    assert.equal(
      getJobSignals(posting('Mid Fullstack Developer (React & Node.js | AI)'))
        .focus,
      'fullstack',
    );
    assert.equal(
      getJobSignals(posting('Front\u2011End Tech Lead (React / Next.js)'))
        .focus,
      'frontend',
    );
  });

  it('falls back to the technologies when the title does not say', () => {
    assert.equal(
      getJobSignals(
        posting('Software Engineer', [
          'React',
          'TypeScript',
          'Tailwind CSS',
          'Next.js',
        ]),
      ).focus,
      'frontend',
    );
    assert.equal(
      getJobSignals(
        posting('Software Engineer', ['Node.js', 'PostgreSQL', 'Docker']),
      ).focus,
      'backend',
    );
    assert.equal(
      getJobSignals(
        posting('Software Engineer', [
          'React',
          'Node.js',
          'PostgreSQL',
          'Next.js',
        ]),
      ).focus,
      'fullstack',
    );
  });

  it('detects AI-heavy jobs from the title or from two AI requirements', () => {
    assert.equal(
      getJobSignals(posting('Mid Fullstack Developer (React & Node.js | AI)'))
        .aiHeavy,
      true,
    );
    assert.equal(
      getJobSignals(
        posting('Software Engineer', ['LLM integration', 'OpenAI APIs']),
      ).aiHeavy,
      true,
    );
    assert.equal(
      getJobSignals(posting('Backend Developer', ['Node.js'])).aiHeavy,
      false,
    );
  });

  it('collects the technologies the job mentions', () => {
    const { skills } = getJobSignals(
      posting('Backend Developer', ['Node.js', 'Express.js'], ['Docker']),
    );
    for (const id of ['node', 'express', 'docker'])
      assert.ok(skills.has(id), `missing ${id}`);
  });
});
