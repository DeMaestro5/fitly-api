import type { JobSourceId } from '../schemas/job.schema';
import {
  COMPILED_KNOWN_STACKS,
  extractCanonicalSkills,
  isCoreSkill,
  isGenericSkill,
  normalizeText,
} from './skills-dictionary';

export interface JobForScoringInput {
  title: string;
  source?: JobSourceId;
  tags?: string[];
  descriptionText?: string;
}

export type ScoreLabel = 'strong' | 'possible' | 'low';

export interface JobScoreResult {
  score: number;
  matched: string[];
  label: ScoreLabel;
}
const NON_ENGINEERING_TITLE =
  /\b(sales|account executive|account manager|business development|marketing|growth manager|content writer|copywriter|customer support|customer success|designer|graphic design|product designer|ui\/ux|recruiter|recruiting|talent acquisition|human resources|\bhr\b|legal|counsel|compliance|accountant|accounting|finance|financial analyst|operations|office manager|(?:product|project|program|delivery) manager|scrum master|technical writer|social media|seo specialist|data entry|virtual assistant|community manager)\b/i;

// Words that really mean "this person writes software". "lead" and "specialist" are
// deliberately NOT here: "Marketing Lead" must not slip past the non-engineering cap.
const HARD_ENGINEERING_TITLE =
  /\b(engineer|developer|architect|programmer|swe)\b/i;

const BACKEND_WORDS =
  /\b(full[\s-]?stack|back[\s-]?end|backend|node(?:\.js)?|nodejs|api|server)\b/i;

const ENGINEERING_TITLE =
  /\b(engineer|developer|architect|programmer|swe|lead|specialist)\b/i;

const FRONTEND_WORDS =
  /\b(front[\s-]?end|frontend|ui(?:\/ux)?\s+(?:engineer|developer|lead)|web\s+(?:developer|engineer))\b/i;

function computeRoleFit(title: string): number {
  const lower = title.toLowerCase();

  // If not an engineering / developer role:
  if (!ENGINEERING_TITLE.test(lower)) {
    return 0;
  }

  let fit = 0;

  // Base engineering role
  if (
    /\b(full[\s-]?stack|back[\s-]?end|front[\s-]?end|applications?|systems?)\s+(engineer|developer)\b/i.test(
      lower,
    )
  ) {
    fit += 25;
  } else if (/\bsoftware\s+(engineer|developer)\b/i.test(lower)) {
    fit += 25;
  } else if (/\bweb\s+(engineer|developer)\b/i.test(lower)) {
    fit += 20;
  } else {
    fit += 20;
  }

  // Specialization fit
  if (/\bfull[\s-]?stack\b/i.test(lower)) {
    fit += 15;
  } else if (/\bback[\s-]?end\b/i.test(lower)) {
    fit += 12;
  } else if (/\bfront[\s-]?end\b/i.test(lower)) {
    fit += 8;
  } else if (/\bweb\b/i.test(lower)) {
    fit += 4;
  }

  // Core stack in title (node, typescript, react)
  if (/\b(node(?:\.js)?|nodejs)\b/i.test(lower)) fit += 5;
  if (/\b(typescript|ts)\b/i.test(lower)) fit += 5;
  if (
    /\b(react(?:\.js)?|reactjs)\b/i.test(lower) &&
    !/\breact[\s-]native\b/i.test(lower)
  ) {
    fit += 5;
  }

  // If title is "Software Engineer" with no other stack/specialization, ensure it lands 35
  if (fit === 25 && /\bsoftware\s+(engineer|developer)\b/i.test(lower)) {
    fit = 35;
  }

  return Math.min(45, Math.max(0, fit));
}

/**
 * Pure function that scores a job against the candidate's skill profile.
 * Returns a 0-100 integer score, matched skills array (max 8, strongest first),
 * and label ("strong" | "possible" | "low").
 */
export function scoreJob(
  job: JobForScoringInput,
  profile: Set<string>,
): JobScoreResult {
  // Upfront text normalization (replace Unicode hyphens, NBSP, collapse newlines)
  const title = normalizeText(job.title || '');
  const descriptionText = normalizeText(job.descriptionText || '');
  // Tags (and source) are deliberately NOT used: the same job carries different
  // tags on every feed, so using them made one job score differently per source.

  // 2. Non-engineering title check
  const isNonEngineering =
    NON_ENGINEERING_TITLE.test(title) && !HARD_ENGINEERING_TITLE.test(title);

  // 3. Frontend-only check: frontend/UI/web without backend words
  const isFrontendOnly =
    FRONTEND_WORDS.test(title) && !BACKEND_WORDS.test(title);

  // 4. Role fit from title (full-stack & backend keep up to 45; frontend-only capped at 30)
  let roleFit = isNonEngineering ? 0 : computeRoleFit(title);
  if (isFrontendOnly) {
    roleFit = Math.min(30, roleFit);
  }

  // 5. Skill overlap (0-55 points)
  // Matching locations:
  // - Title: counts 3
  // - Description: counts 1
  // - Tag-only (in tags, not in title, not in description): counts 1 (for non-remoteok)
  const titleSkills = new Set(extractCanonicalSkills(title));
  const descSkills = new Set(extractCanonicalSkills(descriptionText));

  const matchedCore: { skill: string; weight: number }[] = [];
  const matchedGeneric: { skill: string; weight: number }[] = [];

  for (const skill of profile) {
    let weight = 0;
    if (titleSkills.has(skill)) {
      weight = 3;
    } else if (descSkills.has(skill)) {
      weight = 1;
    }

    if (weight > 0) {
      if (isGenericSkill(skill)) {
        matchedGeneric.push({ skill, weight });
      } else {
        matchedCore.push({ skill, weight });
      }
    }
  }

  // Core skills scale to 55 (target 10 raw points for full 55)
  const coreRawPoints = matchedCore.reduce((sum, m) => sum + m.weight, 0);
  const coreSkillScore = Math.min(55, Math.round((coreRawPoints / 10) * 55));

  // Generic skills together contribute at most 6 points of the skill-overlap score
  const genericRawPoints = matchedGeneric.reduce((sum, m) => sum + m.weight, 0);
  const genericSkillScore = Math.min(6, genericRawPoints);

  const skillScore = Math.min(55, coreSkillScore + genericSkillScore);

  // Chips (matched[]): list core skills first, include generic only if < 4 core skills matched
  matchedCore.sort(
    (a, b) => b.weight - a.weight || a.skill.localeCompare(b.skill),
  );
  matchedGeneric.sort(
    (a, b) => b.weight - a.weight || a.skill.localeCompare(b.skill),
  );

  let matched: string[];
  if (matchedCore.length >= 4) {
    matched = matchedCore.slice(0, 8).map((m) => m.skill);
  } else {
    matched = [
      ...matchedCore.map((m) => m.skill),
      ...matchedGeneric.map((m) => m.skill),
    ].slice(0, 8);
  }

  // 6. Foreign-Stack Penalty (derived from profile, up to -40 points)
  // Check if title already features at least 2 core profile skills (e.g. Node + React)
  const titleCoreSkills = Array.from(profile).filter(
    (skill) => isCoreSkill(skill) && titleSkills.has(skill),
  );
  const hasAtLeast2CoreInTitle = titleCoreSkills.length >= 2;

  let penalty = 0;
  let foreignStackInTitle = false;
  for (const stack of COMPILED_KNOWN_STACKS) {
    if (profile.has(stack.id)) continue; // Never penalize a stack the profile contains
    if (stack.id === 'nest' && profile.has('node')) continue; // Nest is treated as Node alias

    if (stack.regexes.some((re) => re.test(title))) {
      foreignStackInTitle = true;
      penalty += hasAtLeast2CoreInTitle ? 8 : 20;
    }
  }
  const mismatchPenalty = Math.min(40, penalty);

  // 7. Aggregate and clamp
  let total = roleFit + skillScore - mismatchPenalty;
  if (isNonEngineering) {
    total = Math.min(total, 10);
  }
  // The title is the strongest statement of the role. If it names a stack we don't use
  // and none that we do, description keywords can never lift it into "possible" (45+).
  if (foreignStackInTitle && titleCoreSkills.length === 0) {
    total = Math.min(total, 44);
  }
  if (isFrontendOnly) {
    total = Math.min(75, total);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(total)));
  const label: ScoreLabel =
    finalScore >= 70 ? 'strong' : finalScore >= 45 ? 'possible' : 'low';

  return {
    score: finalScore,
    matched,
    label,
  };
}
