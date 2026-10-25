import { env } from '../config/env';
import { buildTailorPrompt } from '../prompts/tailor-prompts';
import {
  TailorableSchema,
  type MasterResume,
  type Tailorable,
} from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import { normalizeDeep } from '../utils/normalize-text';
import { diffTailorable, type DiffReport } from './diff-service';
import { computeGaps, type GapsReport } from './gap-service';
import { checkTailored, type Finding } from './guardrail';
import type { LlmClient } from './groq-service';
import type { MasterResumeService } from './masterResume';
import { buildResume } from './resume-merge';
import { JobPostingService, PreparedPosting } from './jobPosting-service';
import { suggestFileName } from '../utils/file-name';
import { assessFit, type FitReport } from './fit-service';
import { getJobSignals, type Focus } from './job-signals';
import { orderSkillsForJob } from './skills-order';
import { createSummaryService, type SummarySource } from './summary-service';

const MAX_ATTEMPTS = 2;

interface TailorDeps {
  masterResume: MasterResumeService;
  llm: LlmClient;
  jobPosting: JobPostingService;
}

export interface TailorResult {
  tailored: Tailorable;
  diff: DiffReport;
  gaps: GapsReport | null;
  warnings: Finding[];
  posting: Omit<PreparedPosting, 'text' | 'requirements'> & {
    startsWith: string;
    endsWith: string;
  };
  fit: FitReport | null;
  suggestedFileName: string;
  summaryInfo: { source: SummarySource; focus: Focus; aiHeavy: boolean };
}

function describeIssues(
  issues: { path: PropertyKey[]; message: string }[],
): string {
  return issues
    .slice(0, 8)
    .map((i) => `- ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

async function runTailoring(
  master: MasterResume,
  jobDescription: string,
  llm: LlmClient,
) {
  const { system, user } = buildTailorPrompt(master.tailorable, jobDescription);
  let userMessage = user;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await llm.completeJson({ system, user: userMessage });
    const parsed = TailorableSchema.safeParse(raw);

    let problems: string;
    if (parsed.success) {
      // The summary service writes the headline and summary, so whatever the model wrote
      // for them here is ignored (the originals are put back before the fact checks run).
      const tailored = normalizeDeep(parsed.data);
      const findings = checkTailored(
        master.tailorable,
        tailored,
        jobDescription,
      );
      const errors = findings.filter((f) => f.severity === 'error');
      const warnings = findings.filter((f) => f.severity === 'warning');
      if (errors.length === 0) return { tailored, warnings };

      problems = errors
        .slice(0, 10)
        .map((f) => `- ${f.path}: ${f.message}`)
        .join('\n');
      console.error(
        `Guardrail errors (attempt ${attempt}/${MAX_ATTEMPTS}):\n${problems}`,
      );
    } else {
      problems = describeIssues(parsed.error.issues);
      console.error(
        `Tailor output failed validation (attempt ${attempt}/${MAX_ATTEMPTS}):\n${problems}`,
      );
      if (env.NODE_ENV !== 'production') {
        console.error(
          'Raw response (truncated):',
          JSON.stringify(raw)?.slice(0, 500),
        );
      }
    }

    userMessage = `${user}
  
  <validation_errors>
  Your previous response was rejected:
  ${problems}
  Fix exactly these problems and return ONLY a single JSON object with the same structure as the input. Do not add anything that is not in the original content.
  </validation_errors>`;
  }

  throw new AppError(
    502,
    'The AI could not produce a resume that passes the fact checks',
  );
}

export function createTailorService({
  masterResume,
  llm,
  jobPosting,
}: TailorDeps) {
  const summaryWriter = createSummaryService({ llm });

  return {
    async tailor(rawJobDescription: string): Promise<TailorResult> {
      const posting = await jobPosting.prepare(rawJobDescription);
      const jobDescription = posting.text;
      const master = await masterResume.get();

      const { tailored: modelOutput, warnings } = await runTailoring(
        master,
        jobDescription,
        llm,
      );

      // Headline and summary: written for this job, fact-checked, with a safe fallback.
      const signals = getJobSignals(posting);
      const written = await summaryWriter.write(master, posting, signals);

      const tailored: Tailorable = {
        ...modelOutput,
        headline: written.headline,
        summary: written.summary,
        skills: orderSkillsForJob(modelOutput.skills, signals.skills),
      };

      buildResume(master, tailored); // final integrity check on the merged document

      const allWarnings: Finding[] =
        written.source === 'ai'
          ? warnings
          : [
              ...warnings,
              {
                severity: 'warning' as const,
                rule: 'summary-scope' as const,
                path: 'summary',
                message:
                  written.source === 'reordered'
                    ? `The AI summary did not pass the fact checks, so your own summary sentences were reordered for this job. Reason: ${written.reason}`
                    : `The AI summary did not pass the fact checks, so your original summary was kept. Reason: ${written.reason}`,
              },
            ];

      const gaps: GapsReport | null = posting.requirements
        ? computeGaps(posting.requirements, master)
        : null;

      const fit = assessFit(gaps);

      return {
        tailored,
        diff: diffTailorable(master.tailorable, tailored),
        gaps,
        warnings: allWarnings,
        fit,
        summaryInfo: {
          source: written.source,
          focus: signals.focus,
          aiHeavy: signals.aiHeavy,
        },
        suggestedFileName: suggestFileName(
          master.locked.basics.fullName,
          posting.company,
        ),
        posting: {
          title: posting.title,
          method: posting.method,
          company: posting.company,
          constraints: posting.constraints,
          charsBefore: posting.charsBefore,
          charsAfter: posting.charsAfter,
          location: posting.location,
          startsWith: posting.text.slice(0, 200),
          endsWith: posting.text.slice(-200),
        },
      };
    },
  };
}

export type TailorService = ReturnType<typeof createTailorService>;
