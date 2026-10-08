import { MasterResumeSchema } from '../schemas/resume.schema';
import { mkdirSync, writeFileSync } from 'node:fs';

const minimal = {
  schemaVersion: 1,
  locked: {
    basics: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0958',
      location: 'London, UK',
    },
    links: {
      github: 'https://github.com/ada',
      linkedin: 'https://linkedin.com/in/ada',
      portfolio: 'https://ada.dev',
    },
    education: [
      {
        institution: 'University of London',
        area: 'Mathematics',
        endDate: '1840',
      },
    ],
    experience: [
      {
        id: 'analytical-engine',
        title: 'Engineer',
        company: 'Babbage Ltd',
        location: 'London',
        startDate: '1842-01',
        endDate: 'present',
      },
    ],
    projects: [{ id: 'notes', name: 'Notes', technologies: ['Mathematics'] }], // no url on purpose
  },
  tailorable: {
    experience: [
      {
        id: 'analytical-engine',
        bullets: [
          {
            id: 'analytical-engine-1',
            text: 'Wrote the first published algorithm.',
          },
        ],
      },
    ],
  },
};

console.log(
  'valid without project link or hobbies:',
  MasterResumeSchema.safeParse(minimal).success
);

const missingGithub = {
  ...minimal,
  locked: {
    ...minimal.locked,
    links: { ...minimal.locked.links, github: undefined },
  },
};
const result = MasterResumeSchema.safeParse(missingGithub);
console.log('missing GitHub rejected:', !result.success);
if (!result.success) {
  for (const issue of result.error.issues)
    console.log(`- ${issue.path.join('.')}: ${issue.message}`);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/ada.sample.json', JSON.stringify(minimal, null, 2));
