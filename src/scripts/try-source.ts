import { createHimalayasSource } from '../sources/himalayas-source';
import { createRemoteOkSource } from '../sources/remoteok-source';
import type { JobSource } from '../sources/source.type';
import { createWwrSource } from '../sources/wwr-source';
import { createJobicySource } from '../sources/jobicy-source';
import { createRemotiveSource } from '../sources/remotive-source';
import { createArbeitnowSource } from '../sources/arbeitnow-source';

const factories: Record<string, () => JobSource> = {
  himalayas: () => createHimalayasSource(process.env.HIMALAYAS_API_KEY),
  remoteok: () => createRemoteOkSource(),
  wwr: () => createWwrSource(),
  jobicy: () => createJobicySource(),
  remotive: () => createRemotiveSource(),
  arbeitnow: () => createArbeitnowSource(),
};

(async () => {
  const name = process.argv[2];
  const factory = factories[name];
  if (!factory) {
    console.error(
      `Usage: tsx src/scripts/try-source.ts <${Object.keys(factories).join(
        '|'
      )}>`
    );
    process.exit(1);
  }

  const started = Date.now();
  const jobs = await factory().fetchJobs();
  console.log(`${jobs.length} unique jobs in ${Date.now() - started}ms`);

  for (const j of jobs.slice(0, 3)) {
    console.log({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      regionNote: j.regionNote,
      salary: j.salaryText,
      posted: j.postedAt,
      apply: j.applyUrl,
      tags: j.tags.slice(0, 5),
      description: j.descriptionText.slice(0, 200),
    });
  }

  const withNote = jobs.filter((j) => j.regionNote !== null).length;
  console.log({
    withSalary: jobs.filter((j) => j.salaryText !== null).length,
    withRegionNote: withNote,
    noRegionNote: jobs.length - withNote,
    remote: jobs.filter((j) => j.remoteType === 'remote').length,
    onsite: jobs.filter((j) => j.remoteType === 'onsite').length,
    withVisaTag: jobs.filter((j) => j.tags.includes('Visa sponsorship')).length,
    endsWithSpamLine: jobs.filter((j) =>
      /Please mention the word/i.test(j.descriptionText)
    ).length,
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
