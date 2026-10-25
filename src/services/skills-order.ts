import type { Tailorable } from '../schemas/resume.schema';
import { extractCanonicalSkills } from './skills-dictionary';

// Moves the skills the job asks for to the front of each group. Nothing is added or removed,
// and the original order is kept inside the "asked for" and "not asked for" halves.
export function orderSkillsForJob(
  skills: Tailorable['skills'],
  jobSkills: Set<string>,
): Tailorable['skills'] {
  if (jobSkills.size === 0) return skills;
  return skills.map((group) => {
    const asked = (item: string) =>
      extractCanonicalSkills(item).some((id) => jobSkills.has(id));
    return {
      ...group,
      items: [
        ...group.items.filter(asked),
        ...group.items.filter((item) => !asked(item)),
      ],
    };
  });
}
