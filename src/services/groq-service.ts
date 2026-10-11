import Groq from 'groq-sdk';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { retry } from '../utils/retry';

export interface LlmClient {
  completeJson(input: {
    system: string;
    user: string;
    temperature?: number;
  }): Promise<unknown>;
}

const MAX_RATE_LIMIT_WAIT_MS = 30_000;

/** Reads hints like "Please try again in 6.8625s", "850ms" or "1m3.2s" from a Groq error message. */
export function parseRetryAfterMs(message: string): number | null {
  const match = /try again in\s+(?:(\d+)m)?\s*([\d.]+)(ms|s)\b/i.exec(message);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const amount = Number(match[2]);
  const ms = match[3].toLowerCase() === 'ms' ? amount : amount * 1000;
  return Math.ceil(minutes * 60_000 + ms + 500); // small buffer
}

const rateLimitWaitMs = (err: unknown): number | null =>
  err instanceof Groq.APIError && err.status === 429
    ? parseRetryAfterMs(err.message)
    : null;

const isRetryable = (err: unknown): boolean => {
  if (err instanceof Groq.APIConnectionError) return true;
  if (err instanceof Groq.APIError) {
    if ((err.status ?? 0) >= 500) return true;
    if (err.status === 429) {
      // Short per-minute limits clear on their own, so wait and try again
      const wait = rateLimitWaitMs(err);
      return wait !== null && wait <= MAX_RATE_LIMIT_WAIT_MS;
    }
  }
  return false;
};

export function createGroqService(): LlmClient {
  const client = new Groq({
    apiKey: env.GROQ_API_KEY,
    timeout: 60_000,
    maxRetries: 0,
  });
  // Reasoning models spend many tokens thinking; "low" keeps this work fast and cheap
  const reasoning = env.GROQ_MODEL.includes('gpt-oss')
    ? ({ reasoning_effort: 'low' } as const)
    : {};

  return {
    async completeJson({ system, user, temperature }) {
      try {
        const completion = await retry(
          () =>
            client.chat.completions.create({
              model: env.GROQ_MODEL,
              temperature: temperature ?? 0.2,
              response_format: { type: 'json_object' },
              ...reasoning,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }),
          {
            retries: 3,
            baseDelayMs: 500,
            shouldRetry: isRetryable,
            getDelayMs: rateLimitWaitMs,
          }
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
            const wait = rateLimitWaitMs(err);
            const hint = wait
              ? ` Wait about ${Math.ceil(wait / 1000)} seconds and try again.`
              : '';
            throw new AppError(
              503,
              `The AI service is rate limited (free-tier limit).${hint}`
            );
          }
          throw new AppError(502, 'The AI service request failed');
        }
        throw err;
      }
    },
  };
}
