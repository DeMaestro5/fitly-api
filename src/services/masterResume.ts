import type { ResumeRepository } from '../repo/resume.repo';
import type { MasterResume } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';

export interface MasterResumeServiceOptions {
  onSaved?: (userId: string, resume: MasterResume) => void;
}

export function createMasterResumeService(
  repo: ResumeRepository,
  options: MasterResumeServiceOptions = {},
) {
  function forUser(userId: string) {
    return {
      async get(): Promise<MasterResume> {
        const resume = await repo.get(userId);
        if (!resume)
          throw new AppError(404, 'No master resume has been uploaded yet');
        return resume;
      },
      async replace(resume: MasterResume): Promise<MasterResume> {
        await repo.save(userId, resume);
        options.onSaved?.(userId, resume);
        return resume;
      },
    };
  }
  return { forUser };
}

export type MasterResumeService = ReturnType<
  ReturnType<typeof createMasterResumeService>['forUser']
>;
