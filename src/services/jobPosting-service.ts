import { z } from 'zod';
import { buildPostingAnalysisPrompt } from '../prompts/posting-analysis-prompts';
import { text } from '../schemas/common.schema';
import type { Requirements } from '../schemas/requirements';
import { AppError } from '../utils/AppError';
import { cleanJobDescription } from '../utils/clean-job-descriptions';
import { normalizeDeep } from '../utils/normalize-text';
import type { LlmClient } from './groq-service';

export const MAX_POSTING_CHARS = 20_000;
const MIN_POSTING_CHARS = 200;

const AnalysisSchema = z.object({
  isJobPosting: z.boolean(),
  title: z.string().trim().max(150).nullable().optional(),
  ranges: z
    .array(
      z.object({ start: z.number().int().min(1), end: z.number().int().min(1) })
    )
    .min(1)
    .max(5)
    .optional(),
  required: z.array(text(60)).max(40).default([]),
  preferred: z.array(text(60)).max(40).default([]),
});

export type PostingMethod = 'ai' | 'full-text';

export interface PreparedPosting {
  text: string;
  title: string | null;
  requirements: Requirements | null;
  method: PostingMethod;
  charsBefore: number;
  charsAfter: number;
}

const BUTTON_LINE =
  /^(apply( now| here)?|save|share|show (more|less)|view job|back to (top|jobs))$/i;

// Drops page buttons that the AI cut sometimes leaves on the first or last line
function trimButtonLines(text: string): string {
  const lines = text.split('\n');
  while (lines.length > 0 && BUTTON_LINE.test(lines[lines.length - 1].trim()))
    lines.pop();
  while (lines.length > 0 && BUTTON_LINE.test(lines[0].trim())) lines.shift();
  return lines.join('\n').trim();
}

const dedupe = (items: string[]): string[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function sliceRanges(
  lines: string[],
  ranges: { start: number; end: number }[]
): string | null {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let lastEnd = 0;
  for (const range of sorted) {
    if (range.end < range.start || range.end > lines.length) return null;
    const start = Math.max(range.start, lastEnd + 1); // tolerate overlapping ranges
    if (start > range.end) continue;
    parts.push(lines.slice(start - 1, range.end).join('\n'));
    lastEnd = range.end;
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}

export function createJobPostingService(llm: LlmClient) {
  const finish = (
    body: string,
    title: string | null,
    requirements: Requirements | null,
    method: PostingMethod,
    charsBefore: number
  ): PreparedPosting => {
    const full = title ? `Job title: ${title}\n\n${body}` : body;
    if (full.length > MAX_POSTING_CHARS) {
      throw new AppError(
        400,
        `The job posting is still ${full.length.toLocaleString(
          'en-US'
        )} characters after cleanup (limit ${MAX_POSTING_CHARS.toLocaleString(
          'en-US'
        )}). Paste only the job description part.`
      );
    }
    return {
      text: full,
      title,
      requirements,
      method,
      charsBefore,
      charsAfter: full.length,
    };
  };

  return {
    async prepare(raw: string): Promise<PreparedPosting> {
      const cleaned = cleanJobDescription(raw);
      const lines = cleaned
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const numbered = lines
        .map((l, i) => `${i + 1}: ${l.slice(0, 300)}`)
        .join('\n');

      let analysis: z.infer<typeof AnalysisSchema>;
      try {
        const { system, user } = buildPostingAnalysisPrompt(numbered);
        const parsed = AnalysisSchema.safeParse(
          await llm.completeJson({ system, user, temperature: 0 })
        );
        if (!parsed.success) throw new Error('Unreadable analysis response');
        analysis = parsed.data;
      } catch (err) {
        console.error(
          'Posting analysis failed, using the full text without requirements:',
          err
        );
        return finish(cleaned, null, null, 'full-text', cleaned.length);
      }

      if (!analysis.isJobPosting) {
        throw new AppError(
          400,
          'That text does not look like a job posting. Paste the job page or the job description.'
        );
      }

      const clean = normalizeDeep(analysis);
      const requirements: Requirements = {
        required: dedupe(clean.required),
        preferred: dedupe(clean.preferred),
      };
      const title = clean.title ?? null;

      const rawSlice = analysis.ranges
        ? sliceRanges(lines, analysis.ranges)
        : null;
      const slice = rawSlice ? trimButtonLines(rawSlice) : null;
      if (slice && slice.length >= MIN_POSTING_CHARS) {
        return finish(slice, title, requirements, 'ai', cleaned.length);
      }
      return finish(cleaned, title, requirements, 'full-text', cleaned.length);
    },
  };
}

export type JobPostingService = ReturnType<typeof createJobPostingService>;
