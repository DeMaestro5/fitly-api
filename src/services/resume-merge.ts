import {
  MasterResumeSchema,
  type MasterResume,
  type Tailorable,
} from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';

export function buildResume(
  master: MasterResume,
  tailorable: Tailorable
): MasterResume {
  const result = MasterResumeSchema.safeParse({ ...master, tailorable });
  if (!result.success) {
    console.error('Merged resume failed validation:', result.error.issues);
    throw new AppError(
      500,
      'Could not build a valid resume from the tailored content'
    );
  }
  return result.data;
}
