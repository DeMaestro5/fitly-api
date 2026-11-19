import {
  listJobsForScoring,
  saveScores,
  type JobForScoring,
} from '../repo/jobs.repo';
import { createResumeRepository } from '../repo/resume.repo';
import type { MasterResume } from '../schemas/resume.schema';
import { buildBoilerplateIndex, stripBoilerplate } from './job-boilerplate';
import { scoreJob } from './job-score';
import { buildSkillProfile } from './skill-profile';

type BoilerplateIndex = ReturnType<typeof buildBoilerplateIndex>;

async function scoreWith(
  userId: string,
  resume: MasterResume,
  jobs: JobForScoring[],
  boilerplate: BoilerplateIndex,
): Promise<void> {
  const profile = buildSkillProfile(resume);
  const scored = jobs.map((job) => {
    const { score, matched } = scoreJob(
      { ...job, descriptionText: stripBoilerplate(job, boilerplate) },
      profile,
    );
    return { id: job.id, score, matched };
  });
  await saveScores(userId, scored);
}

export async function scoreUser(
  userId: string,
  resume: MasterResume,
): Promise<void> {
  const jobs = await listJobsForScoring();
  await scoreWith(userId, resume, jobs, buildBoilerplateIndex(jobs));
}

export async function scoreAllUsers(): Promise<void> {
  const everyone = await createResumeRepository().listAll();
  if (everyone.length === 0) {
    console.warn('No master resumes saved yet; skipping stack-fit scoring.');
    return;
  }
  const jobs = await listJobsForScoring();
  const boilerplate = buildBoilerplateIndex(jobs); // built once, shared by all users

  for (const { userId, resume } of everyone) {
    try {
      await scoreWith(userId, resume, jobs, boilerplate);
    } catch (err) {
      console.warn(
        `Scoring failed for user ${userId}; keeping old scores:`,
        err,
      );
    }
  }
}
