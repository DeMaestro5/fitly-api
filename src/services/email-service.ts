import { z } from 'zod';
import {
  buildEmailPrompt,
  resumeToText,
  type EmailJob,
} from '../prompts/email-prompts';
import type { MasterResume } from '../schemas/resume.schema';
import { normalizeDeep } from '../utils/normalize-text';
import { assembleEmail, checkEmailDraft } from './email-rules';
import type { LlmClient } from './groq-service';

const MAX_ATTEMPTS = 2;

const ResponseSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2500),
});

export interface EmailDraft {
  subject: string;
  body: string;
}

export class EmailDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDraftError';
  }
}

export function createEmailService(deps: {
  llm: LlmClient;
  vocabulary: string[];
}) {
  const { llm } = deps;

  return {
    async write(master: MasterResume, job: EmailJob): Promise<EmailDraft> {
      const { system, user } = buildEmailPrompt(master, job);
      const resumeText = resumeToText(master);
      const vocabulary = [...deps.vocabulary, ...job.tags];
      const { basics, links } = master.locked;
      const signature = {
        name: basics.fullName,
        email: basics.email,
        links: [links.github, links.linkedin, links.portfolio],
      };

      let userMessage = user;
      let problems: string[] = [];

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let raw: unknown;
        try {
          raw = await llm.completeJson({
            system,
            user: userMessage,
            temperature: 0.4,
          });
        } catch (err) {
          console.error('Email call failed:', err);
          throw new EmailDraftError(
            'The AI call failed. Wait a minute and try again.',
          );
        }

        const parsed = ResponseSchema.safeParse(raw);
        if (parsed.success) {
          const draft = normalizeDeep(parsed.data);
          problems = checkEmailDraft({ draft, resumeText, vocabulary });
          if (problems.length === 0) return assembleEmail(draft, signature);
          if (problems.length === 0) return assembleEmail(draft, signature);
          console.error('Rejected body:\n' + draft.body);
        } else {
          problems = [
            'Return one JSON object with a "subject" string and a "body" string.',
          ];
        }

        console.error(
          `Email rejected (attempt ${attempt}/${MAX_ATTEMPTS}):\n- ${problems.join('\n- ')}`,
        );
        userMessage = `${user}

<validation_errors>
Your previous answer was rejected:
${problems.map((p) => `- ${p}`).join('\n')}
Fix exactly these problems and return ONLY the JSON object.
</validation_errors>`;
      }

      throw new EmailDraftError(
        `The draft failed its checks: ${problems.slice(0, 2).join('; ')}`,
      );
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
