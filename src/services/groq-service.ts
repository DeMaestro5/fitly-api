import Groq from 'groq-sdk';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { retry } from '../utils/retry';

export interface LlmClient {
  completeJson(input: { system: string; user: string }): Promise<unknown>;
}

const isRetryable = (err: unknown): boolean =>
  err instanceof Groq.APIConnectionError ||
  (err instanceof Groq.APIError &&
    (err.status === 429 || (err.status ?? 0) >= 500));

export function createGroqService(): LlmClient {
  const client = new Groq({
    apiKey: env.GROQ_API_KEY,
    timeout: 60_000,
    maxRetries: 0,
  });

  return {
    async completeJson({ system, user }) {
      try {
        const completion = await retry(
          () =>
            client.chat.completions.create({
              model: env.GROQ_MODEL,
              temperature: 0.2,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }),
          { retries: 2, baseDelayMs: 500, shouldRetry: isRetryable }
        );

        const content = completion.choices[0]?.message?.content;
        if (!content)
          throw new AppError(502, 'The AI service returned an empty response');

        try {
          return JSON.parse(content);
        } catch {
          throw new AppError(502, 'The AI service returned invalid JSON');
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err instanceof Groq.APIError) {
          console.error('Groq request failed:', err.status, err.message);
          if (err.status === 429) {
            throw new AppError(
              503,
              'The AI service is rate limited, try again shortly'
            );
          }
          throw new AppError(502, 'The AI service request failed');
        }
        throw err;
      }
    },
  };
}
