import { readFileSync } from 'node:fs';
import { MasterResumeSchema } from '../schemas/resume.schema';
import { diffTailorable } from '../services/diff-service';
import { computeGaps } from '../services/gap-service';

const master = MasterResumeSchema.parse(
  JSON.parse(readFileSync('data/master-resume.json', 'utf8'))
);

const gaps = computeGaps(
  {
    required: [
      'Go',
      'Kafka',
      'Kubernetes',
      'AWS',
      'Node.js',
      'Postgres',
      'TypeScript',
      'React',
      'gRPC',
      'Terraform',
      'event-driven architecture',
    ],
    preferred: ['Redis', 'Docker', 'GitHub Actions'],
  },
  master
);
console.log(JSON.stringify(gaps, null, 2));

const original = master.tailorable;
console.log(
  'identical:',
  diffTailorable(original, structuredClone(original)).stats
);

const tailored = structuredClone(original);
const novba = tailored.experience.find((r) => r.id === 'novba')!;
novba.bullets.reverse();
novba.bullets[0].text = 'Reworded bullet text.';
novba.bullets.pop();
tailored.skills.reverse();
const diff = diffTailorable(original, tailored);
console.log(
  'tampered:',
  diff.stats,
  'novba reordered:',
  diff.experience[0].reordered,
  'groups reordered:',
  diff.skills.groupsReordered
);
