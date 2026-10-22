import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreJob } from './job-score';
import { extractCanonicalSkills } from './skills-dictionary';

const profile = new Set([
  'node',
  'typescript',
  'javascript',
  'react',
  'react native',
  'next.js',
  'express',
  'postgres',
  'mongodb',
  'redis',
  'supabase',
  'prisma',
  'docker',
  'ci/cd',
  'tailwind',
  'rest',
]);

describe('scoreJob - stack-fit scoring', () => {
  it('scores Senior Full-Stack Engineer (Node.js, React, TypeScript) >= 70 (strong)', () => {
    const res = scoreJob(
      {
        title: 'Senior Full-Stack Engineer (Node.js, React, TypeScript)',
        tags: ['TypeScript', 'Node.js', 'React'],
        descriptionText:
          'Building scalable web applications with Node, React, and PostgreSQL.',
      },
      profile,
    );
    assert.ok(res.score >= 70, `Expected score >= 70, got ${res.score}`);
    assert.equal(res.label, 'strong');
    assert.ok(res.matched.includes('typescript'));
    assert.ok(res.matched.includes('react'));
    assert.ok(res.matched.includes('node'));
  });

  it('scores Backend Engineer, Node.js and PostgreSQL >= 55', () => {
    const res = scoreJob(
      {
        title: 'Backend Engineer, Node.js and PostgreSQL',
        tags: ['Backend', 'Postgres'],
        descriptionText: 'Designing REST APIs with Node.js and PostgreSQL.',
      },
      profile,
    );
    assert.ok(res.score >= 55, `Expected score >= 55, got ${res.score}`);
    assert.ok(res.matched.includes('node'));
    assert.ok(res.matched.includes('postgres'));
  });

  it('scores Frontend Engineer (React) in 45-69 band (possible)', () => {
    const res = scoreJob(
      {
        title: 'Frontend Engineer (React)',
        tags: [],
        descriptionText: 'Building UI components with React.',
      },
      profile,
    );
    assert.ok(
      res.score >= 45 && res.score <= 69,
      `Expected score in 45-69, got ${res.score}`,
    );
    assert.equal(res.label, 'possible');
  });

  it('scores Full-Stack Developer (TypeScript, Next.js, Tailwind) >= 70 (strong)', () => {
    const res = scoreJob(
      {
        title: 'Full-Stack Developer (TypeScript, Next.js, Tailwind)',
        tags: ['Next.js', 'TypeScript'],
        descriptionText:
          'Modern web app with Next.js, Tailwind CSS, and TypeScript.',
      },
      profile,
    );
    assert.ok(res.score >= 70, `Expected score >= 70, got ${res.score}`);
    assert.equal(res.label, 'strong');
  });

  it('scores Node.js Backend Developer >= 55', () => {
    const res = scoreJob(
      {
        title: 'Node.js Backend Developer',
        tags: ['Node'],
        descriptionText: 'Building microservices in Node and Express.',
      },
      profile,
    );
    assert.ok(res.score >= 55, `Expected score >= 55, got ${res.score}`);
  });

  it('scores Java Backend Engineer < 45 due to mismatch penalty', () => {
    const res = scoreJob(
      {
        title: 'Java Backend Engineer',
        tags: ['Java', 'Spring Boot'],
        descriptionText: 'Enterprise services in Java.',
      },
      profile,
    );
    assert.ok(res.score < 45, `Expected score < 45, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('scores Senior Ruby on Rails Developer < 45', () => {
    const res = scoreJob(
      {
        title: 'Senior Ruby on Rails Developer',
        tags: ['Ruby', 'Rails'],
        descriptionText: 'Web app with Ruby on Rails.',
      },
      profile,
    );
    assert.ok(res.score < 45, `Expected score < 45, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('hard caps Account Executive <= 10', () => {
    const res = scoreJob(
      {
        title: 'Account Executive',
        tags: ['Sales'],
        descriptionText: 'Enterprise B2B software sales.',
      },
      profile,
    );
    assert.ok(res.score <= 10, `Expected score <= 10, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('hard caps Marketing Manager <= 10', () => {
    const res = scoreJob(
      {
        title: 'Marketing Manager',
        tags: ['Marketing', 'SEO'],
        descriptionText: 'Lead inbound marketing campaigns.',
      },
      profile,
    );
    assert.ok(res.score <= 10, `Expected score <= 10, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('hard caps Product Designer (UI/UX) <= 10', () => {
    const res = scoreJob(
      {
        title: 'Product Designer (UI/UX)',
        tags: ['Design', 'Figma'],
        descriptionText: 'Designing mobile and web interfaces.',
      },
      profile,
    );
    assert.ok(res.score <= 10, `Expected score <= 10, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('scores React Native Developer below Frontend Engineer (React)', () => {
    const web = scoreJob(
      { title: 'Frontend Engineer (React)', tags: [], descriptionText: '' },
      profile,
    );
    const native = scoreJob(
      { title: 'React Native Developer', tags: [], descriptionText: '' },
      profile,
    );
    assert.ok(
      native.score < web.score,
      `Expected React Native (${native.score}) < React Web (${web.score})`,
    );
  });

  it('scores Software Engineer with no stack info in 30-60 range', () => {
    const res = scoreJob(
      {
        title: 'Software Engineer',
        tags: [],
        descriptionText: '',
      },
      profile,
    );
    assert.ok(
      res.score >= 30 && res.score <= 60,
      `Expected score in 30-60, got ${res.score}`,
    );
  });

  it('resolves skill aliases correctly', () => {
    const skills = extractCanonicalSkills(
      'Looking for TS, nodejs, postgresql and mongo experience.',
    );
    assert.ok(skills.includes('typescript'), 'TS -> typescript');
    assert.ok(skills.includes('node'), 'nodejs -> node');
    assert.ok(skills.includes('postgres'), 'postgresql -> postgres');
    assert.ok(skills.includes('mongodb'), 'mongo -> mongodb');
  });

  it('does not treat single words "go" or "c" as skills unless golang / c++ / c#', () => {
    const skills = extractCanonicalSkills(
      'You will go on trips and work closely with C-level executives to go above and beyond.',
    );
    assert.equal(
      skills.length,
      0,
      'No skills should match single words "go" or "c"',
    );
  });

  it('recognizes Golang and C++ / C# when explicitly written', () => {
    const skills = extractCanonicalSkills(
      'Proficient in Golang, C++ and C# systems.',
    );
    assert.ok(!skills.includes('go'), 'Does not match plain "go"');
    const mismatches = extractCanonicalSkills(
      'Proficient in Golang, C++ and C#.',
    );
    assert.ok(!mismatches.includes('node'));
  });

  // Calibration additions (Milestone 13 calibration)

  it('scores Senior Full Stack Developer (Python, Vue.js & AWS) <= 55', () => {
    const res = scoreJob(
      {
        title: 'Senior Full Stack Developer (Python, Vue.js & AWS)',
        tags: ['Python', 'Vue.js', 'AWS', 'JavaScript', 'HTML', 'CSS', 'Git'],
        descriptionText:
          'Building cloud applications with Python backend and Vue frontend.',
      },
      profile,
    );
    assert.ok(res.score <= 55, `Expected score <= 55, got ${res.score}`);
  });

  it('scores Senior Backend Developer (Python) < 45', () => {
    const res = scoreJob(
      {
        title: 'Senior Backend Developer (Python)',
        tags: ['Python', 'Django', 'REST'],
        descriptionText: 'Developing backend microservices in Python.',
      },
      profile,
    );
    assert.ok(res.score < 45, `Expected score < 45, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('scores Remote OK Frontend Engineer with 25 unrelated tags <= 75 and with no tag-derived chips', () => {
    const noisyTags = [
      'node',
      'postgres',
      'docker',
      'redis',
      'mongodb',
      'prisma',
      'next.js',
      'express',
      'typescript',
      'react',
      'tailwind',
      'graphql',
      'aws',
      'python',
      'devops',
      'cloud',
      'saas',
      'api',
      'linux',
      'microservices',
      'fullstack',
      'backend',
      'server',
      'sql',
      'nosql',
    ];

    const res = scoreJob(
      {
        title: 'Frontend Engineer',
        source: 'remoteok',
        tags: noisyTags,
        descriptionText: 'Responsible for client-side web interfaces.',
      },
      profile,
    );

    assert.ok(res.score <= 75, `Expected score <= 75, got ${res.score}`);
    // Remote OK tags must be completely ignored, so chips must not contain tag-derived skills
    assert.equal(
      res.matched.length,
      0,
      `Expected 0 tag-derived chips for remoteok, got ${res.matched.join(', ')}`,
    );
  });

  it('scores a job whose only matches are git/html/css/rest <= 30', () => {
    const res = scoreJob(
      {
        title: 'Web Developer',
        source: 'wwr',
        tags: ['Git', 'HTML', 'CSS', 'REST'],
        descriptionText:
          'Maintain existing static sites using Git and REST endpoints.',
      },
      profile,
    );

    assert.ok(
      res.score <= 30,
      `Expected score <= 30 for generic-only matches, got ${res.score}`,
    );
  });

  it('does not penalize a stack that is present in the profile', () => {
    const profileWithPython = new Set([...profile, 'python']);

    const resUnpenalized = scoreJob(
      {
        title: 'Backend Developer (Python)',
        source: 'wwr',
        tags: ['Python'],
        descriptionText: 'Developing scalable backend systems.',
      },
      profileWithPython,
    );

    const resPenalized = scoreJob(
      {
        title: 'Backend Developer (Python)',
        source: 'wwr',
        tags: ['Python'],
        descriptionText: 'Developing scalable backend systems.',
      },
      profile,
    );

    assert.ok(
      resUnpenalized.score > resPenalized.score,
      `Expected unpenalized score (${resUnpenalized.score}) > penalized score (${resPenalized.score})`,
    );
    assert.ok(
      resUnpenalized.score >= 45,
      `Expected unpenalized score >= 45, got ${resUnpenalized.score}`,
    );
  });

  // Calibration Pass 3 additions

  it('scores Senior Angular Full-stack Developer < 45', () => {
    const res = scoreJob(
      {
        title: 'Senior Angular Full-stack Developer',
        source: 'wwr',
        tags: ['Angular', 'TypeScript'],
        descriptionText: 'Building enterprise applications with Angular.',
      },
      profile,
    );
    assert.ok(res.score < 45, `Expected score < 45, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('gives the same score to the same job whatever tags each source attaches', () => {
    const base = {
      title: 'Senior React Full-stack Developer',
      descriptionText: 'Build React apps.',
    };
    const clean = scoreJob({ ...base, source: 'himalayas', tags: [] }, profile);
    const noisy = scoreJob(
      {
        ...base,
        source: 'remotive',
        tags: ['Python', 'Java', 'Angular', '.NET', 'Ruby'],
      },
      profile,
    );
    assert.deepEqual(noisy, clean);
  });
  it('scores Senior .NET Full-stack Developer < 45', () => {
    const res = scoreJob(
      {
        title: 'Senior .NET Full-stack Developer',
        source: 'wwr',
        tags: ['.NET', 'C#'],
        descriptionText: 'Full-stack development using .NET and C#.',
      },
      profile,
    );
    assert.ok(res.score < 45, `Expected score < 45, got ${res.score}`);
    assert.equal(res.label, 'low');
  });

  it('scores Staff Software Engineer - Python, Java / Spring < 35', () => {
    const res = scoreJob(
      {
        title: 'Staff Software Engineer - Python, Java / Spring',
        source: 'jobicy',
        tags: ['Python', 'Java', 'Spring'],
        descriptionText: 'Platform services in Python and Java.',
      },
      profile,
    );
    assert.ok(res.score < 35, `Expected score < 35, got ${res.score}`);
  });

  it('detects Front‑End Tech Lead (React / Next.js) with non-breaking hyphen as frontend-only and caps <= 75', () => {
    // Note: uses U+2011 non-breaking hyphen in "Front‑End"
    const res = scoreJob(
      {
        title: 'Front\u2011End Tech Lead (React / Next.js)',
        source: 'himalayas',
        tags: ['React', 'Next.js'],
        descriptionText:
          'Leading modern web frontend architecture with React and Next.js.',
      },
      profile,
    );
    assert.ok(res.score <= 75, `Expected score <= 75, got ${res.score}`);
    assert.ok(res.score >= 50, `Expected score >= 50, got ${res.score}`);
  });

  it('scores Senior Fullstack Developer (React.js / Node.js) still >= 70', () => {
    const res = scoreJob(
      {
        title: 'Senior Fullstack Developer (React.js / Node.js)',
        source: 'himalayas',
        tags: ['React', 'Node.js'],
        descriptionText: 'Full stack development with React and Node.',
      },
      profile,
    );
    assert.ok(res.score >= 70, `Expected score >= 70, got ${res.score}`);
    assert.equal(res.label, 'strong');
  });

  it('penalizes Full-Stack Engineer (Node.js, React, some Python) by only 8, not 20', () => {
    const resWithPython = scoreJob(
      {
        title: 'Full-Stack Engineer (Node.js, React, some Python)',
        source: 'himalayas',
        tags: ['Node.js', 'React'],
        descriptionText:
          'Full-stack role with Node and React, with occasional Python scripting.',
      },
      profile,
    );

    const resWithoutPython = scoreJob(
      {
        title: 'Full-Stack Engineer (Node.js, React)',
        source: 'himalayas',
        tags: ['Node.js', 'React'],
        descriptionText: 'Full-stack role with Node and React.',
      },
      profile,
    );

    const diff = resWithoutPython.score - resWithPython.score;
    assert.equal(
      diff,
      8,
      `Expected Python penalty of exactly 8 points, but score diff was ${diff} (${resWithoutPython.score} - ${resWithPython.score})`,
    );
  });

  it('does not penalize Senior Backend Developer (Node.js / Nest.js) for Nest', () => {
    const resNest = scoreJob(
      {
        title: 'Senior Backend Developer (Node.js / Nest.js)',
        source: 'wwr',
        tags: ['Node.js', 'Nest.js'],
        descriptionText: 'Designing backend microservices in Node and NestJS.',
      },
      profile,
    );

    const resPlainNode = scoreJob(
      {
        title: 'Senior Backend Developer (Node.js)',
        source: 'wwr',
        tags: ['Node.js'],
        descriptionText: 'Designing backend microservices in Node.',
      },
      profile,
    );

    // Nest must not trigger any foreign stack penalty
    assert.ok(
      resNest.score >= resPlainNode.score,
      `Expected Nest score (${resNest.score}) >= plain Node score (${resPlainNode.score})`,
    );
    assert.ok(
      resNest.score >= 55,
      `Expected Nest score >= 55, got ${resNest.score}`,
    );
  });

  // Calibration Pass 5
  it('hard caps Marketing Lead, Sales Specialist and Customer Success Specialist <= 10', () => {
    for (const title of [
      'Marketing Lead',
      'Sales Specialist',
      'Customer Success Specialist',
    ]) {
      const res = scoreJob(
        { title, descriptionText: 'Node, TypeScript, React and Postgres.' },
        profile,
      );
      assert.ok(res.score <= 10, `${title}: expected <= 10, got ${res.score}`);
    }
  });

  it('hard caps Product Manager <= 10 even with a description full of our stack', () => {
    const res = scoreJob(
      {
        title: 'Product Manager',
        descriptionText: 'Node, TypeScript, React, Postgres, Docker, Redis.',
      },
      profile,
    );
    assert.ok(res.score <= 10, `Expected <= 10, got ${res.score}`);
  });

  it('still scores Tech Lead (Node.js, React) >= 55', () => {
    const res = scoreJob(
      {
        title: 'Tech Lead (Node.js, React)',
        descriptionText: 'Leading a team.',
      },
      profile,
    );
    assert.ok(res.score >= 55, `Expected >= 55, got ${res.score}`);
  });

  it('does not read ordinary English words as skills', () => {
    const skills = extractCanonicalSkills(
      'Please express your interest and react quickly. The rest of the team will bull ahead.',
    );
    assert.equal(skills.length, 0, `Unexpected skills: ${skills.join(', ')}`);
  });

  it('still recognises the tech spellings', () => {
    const skills = extractCanonicalSkills(
      'Node and Express, React, TS, REST APIs, BullMQ.',
    );
    for (const id of [
      'node',
      'express',
      'react',
      'typescript',
      'rest',
      'bull',
    ]) {
      assert.ok(skills.includes(id), `missing ${id}`);
    }
  });

  it('does not count React Native or React-Native as React', () => {
    for (const text of ['React Native', 'React-Native', 'REACT NATIVE']) {
      const skills = extractCanonicalSkills(text);
      assert.ok(!skills.includes('react'), `${text} must not match react`);
      assert.ok(
        skills.includes('react native'),
        `${text} must match react native`,
      );
    }
  });

  // Calibration Pass 6
  it('keeps Angular and .NET titles below 45 even when the description lists our stack', () => {
    const blurb =
      'We work with React, Next.js, Node.js, OpenAI, React Native and TypeScript.';
    for (const title of [
      'Senior Angular Full-stack Developer',
      'Senior .NET Full-stack Developer',
      'Tech Lead Full-Stack Rails Engineer',
    ]) {
      const res = scoreJob({ title, descriptionText: blurb }, profile);
      assert.ok(res.score < 45, `${title}: expected < 45, got ${res.score}`);
    }
  });
});
