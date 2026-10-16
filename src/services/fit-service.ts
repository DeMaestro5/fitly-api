import type { GapsReport } from './gap-service';

export type Verdict = 'apply' | 'maybe' | 'skip';

export interface FitReport {
  verdict: Verdict;
  coverage: number;
  reason: string;
}

export const APPLY_AT = 70;
export const MAYBE_AT = 45;

export function assessFit(gaps: GapsReport | null): FitReport | null {
  if (!gaps || gaps.coverage === null) return null;

  const coverage = Math.round(gaps.coverage);
  const verdict: Verdict =
    coverage >= APPLY_AT ? 'apply' : coverage >= MAYBE_AT ? 'maybe' : 'skip';

  // Only required skills count as "missing" here; nice-to-haves don't block an application
  const missing = gaps.required.missing;
  const shown = missing.slice(0, 5).join(', ');
  const more = missing.length > 5 ? ` and ${missing.length - 5} more` : '';
  const reason =
    missing.length === 0
      ? `${coverage}% of the required skills are on your resume.`
      : `${coverage}% of the required skills are on your resume. Missing required: ${shown}${more}.`;

  return { verdict, coverage, reason };
}
