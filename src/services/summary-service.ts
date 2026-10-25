import { z } from 'zod';
import { buildSummaryPrompt } from '../prompts/summary-prompts';
import type { MasterResume } from '../schemas/resume.schema';
import { normalizeDeep } from '../utils/normalize-text';
import type { LlmClient } from './groq-service';
import type { JobSignals } from './job-signals';
import type { PreparedPosting } from './jobPosting-service';
import {
  buildFacts,
  reorderOriginalSummary,
  validateHeadline,
  validateSummary,
} from './summary-rules';

const MAX_ATTEMPTS = 2;

const ResponseSchema = z.object({
  headline: z.string().trim().max(150).optional(),
  summary: z.string().trim().min(1).max(1200),
});

export type SummarySource = 'ai' | 'reordered' | 'original';

export interface SummaryResult {
  headline: string | undefined;
  summary: string | undefined;
  source: SummarySource;
  reason: string | null; // why the AI version was not used
}

export function createSummaryService({ llm }: { llm: LlmClient }) {
  return {
    // Never throws: a failed summary must not fail the whole tailoring.
    async write(
      master: MasterResume,
      posting: PreparedPosting,
      signals: JobSignals,
    ): Promise<SummaryResult> {
      const originalSummary = master.tailorable.summary;
      const originalHeadline = master.tailorable.headline;
      if (!originalSummary?.trim()) {
        return {
          headline: originalHeadline,
          summary: originalSummary,
          source: 'original',
          reason: null,
        };
      }

      const facts = buildFacts(master);
      const { system, user } = buildSummaryPrompt({
        master,
        posting,
        signals,
        facts,
      });
      let userMessage = user;
      let reason = 'the AI did not return a usable answer';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let problems: string[] = [];
        try {
          const raw = await llm.completeJson({
            system,
            user: userMessage,
            temperature: 0.3,
          });
          const parsed = ResponseSchema.safeParse(raw);
          if (parsed.success) {
            const clean = normalizeDeep(parsed.data);
            const summaryProblems = validateSummary(clean.summary, facts);
            const headlineProblems = clean.headline
              ? validateHeadline(clean.headline, facts)
              : [];
            if (summaryProblems.length === 0) {
              // The headline is polish: use it only when it passes, else keep the original.
              const useHeadline =
                Boolean(clean.headline) && headlineProblems.length === 0;
              return {
                headline: useHeadline ? clean.headline : originalHeadline,
                summary: clean.summary,
                source: 'ai',
                reason: null,
              };
            }
            problems = [
              ...summaryProblems.map((p) => `summary: ${p}`),
              ...headlineProblems.map((p) => `headline: ${p}`),
            ];
          } else {
            problems = [
              'Return one JSON object with a "headline" string and a "summary" string.',
            ];
          }
        } catch (err) {
          console.error('Summary call failed, using the fallback:', err);
          reason = 'the AI call failed';
          break;
        }

        reason = problems.slice(0, 2).join(' ');
        console.error(
          `Summary rejected (attempt ${attempt}/${MAX_ATTEMPTS}):\n- ${problems.join('\n- ')}`,
        );
        userMessage = `${user}

<validation_errors>
Your previous answer was rejected:
${problems.map((p) => `- ${p}`).join('\n')}
Fix exactly these problems and return ONLY the JSON object.
</validation_errors>`;
      }

      const reordered = reorderOriginalSummary(originalSummary, signals, facts);
      const unchanged =
        reordered === originalSummary.replace(/\s+/g, ' ').trim();
      return {
        headline: originalHeadline,
        summary: reordered,
        source: unchanged ? 'original' : 'reordered',
        reason,
      };
    },
  };
}

export type SummaryService = ReturnType<typeof createSummaryService>;
