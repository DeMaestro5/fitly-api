import type { MasterResume } from '../schemas/resume.schema';
import { extractCanonicalSkills } from './skills-dictionary';

/**
 * Builds a skill profile (set of canonical skill identifiers) from the
 * candidate's master resume skills section and experience bullets.
 */
export function buildSkillProfile(resume: MasterResume): Set<string> {
  const profile = new Set<string>();

  // 1. Scan master resume skills section: tailorable.skills
  if (resume.tailorable?.skills) {
    for (const group of resume.tailorable.skills) {
      for (const item of group.items) {
        for (const skill of extractCanonicalSkills(item)) {
          profile.add(skill);
        }
      }
    }
  }

  // 2. Scan master resume experience bullets: tailorable.experience[].bullets[].text
  if (resume.tailorable?.experience) {
    for (const exp of resume.tailorable.experience) {
      for (const bullet of exp.bullets) {
        for (const skill of extractCanonicalSkills(bullet.text)) {
          profile.add(skill);
        }
      }
    }
  }

  return profile;
}

