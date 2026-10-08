import type { ResumeRepository } from '../repo/resume.repo';
import type { MasterResume } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';

export function createMasterResumeService(repo: ResumeRepository) {
  return {
    async get(): Promise<MasterResume> {
      const resume = await repo.get();
      if (!resume)
        throw new AppError(404, 'No master resume has been uploaded yet');
      return resume;
    },
    async replace(resume: MasterResume): Promise<MasterResume> {
      await repo.save(resume);
      return resume;
    },
  };
}

export type MasterResumeService = ReturnType<typeof createMasterResumeService>;
