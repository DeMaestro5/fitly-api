import { env } from '../config/env';
import { buildTailorPrompt } from '../prompts/tailor-prompts';
import { TailorableSchema, type Tailorable } from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import { normalizeDeep } from '../utils/normalize-text';
import type { LlmClient } from './groq-service';
import type { MasterResumeService } from './masterResume';

const MAX_ATTEMPTS = 2;

interface TailorDeps {
  masterResume: MasterResumeService;
  llm: LlmClient;
}

export interface TailorResult {
  original: Tailorable;
  tailored: Tailorable;
}

function describeIssues(
  issues: { path: PropertyKey[]; message: string }[]
): string {
  return issues
    .slice(0, 8)
    .map((i) => `- ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export function createTailorService({ masterResume, llm }: TailorDeps) {
  return {
    async tailor(jobDescription: string): Promise<TailorResult> {
      const master = await masterResume.get();
      const { system, user } = buildTailorPrompt(
        master.tailorable,
        jobDescription
      );

      let userMessage = user;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const raw = await llm.completeJson({ system, user: userMessage });
        const parsed = TailorableSchema.safeParse(raw);

        if (parsed.success) {
          return {
            original: master.tailorable,
            tailored: normalizeDeep(parsed.data),
          };
        }

        const problems = describeIssues(parsed.error.issues);
        console.error(
          `Tailor output failed validation (attempt ${attempt}/${MAX_ATTEMPTS}):\n${problems}`
        );
        if (env.NODE_ENV !== 'production') {
          console.error(
            'Raw response (truncated):',
            JSON.stringify(raw)?.slice(0, 500)
          );
        }

        userMessage = `${user}

<validation_errors>
Your previous response was rejected:
${problems}
Return ONLY a single JSON object with the same structure as the input resume content.
</validation_errors>`;
      }

      throw new AppError(
        502,
        'The AI returned a resume that did not match the expected structure'
      );
    },
  };
}

export type TailorService = ReturnType<typeof createTailorService>;
