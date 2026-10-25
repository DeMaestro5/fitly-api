import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderSkillsForJob } from './skills-order';

const skills = [
  {
    id: 'langs',
    group: 'Languages & Frameworks',
    items: [
      'TypeScript',
      'JavaScript (ES6+)',
      'Node.js',
      'React.js',
      'Next.js',
      'Express.js',
      'React Native',
    ],
  },
];

describe('orderSkillsForJob', () => {
  it('moves the skills the job asks for to the front and keeps the rest in order', () => {
    const [group] = orderSkillsForJob(skills, new Set(['node', 'express']));
    assert.deepEqual(group.items, [
      'Node.js',
      'Express.js',
      'TypeScript',
      'JavaScript (ES6+)',
      'React.js',
      'Next.js',
      'React Native',
    ]);
  });

  it('changes nothing when the job names no known skills', () => {
    assert.deepEqual(orderSkillsForJob(skills, new Set()), skills);
  });
});
