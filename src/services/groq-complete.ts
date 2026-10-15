import { AppError } from '../utils/AppError';

export interface CompleteInput {
  system: string;
  user: string;
}

/** Sends one prompt and returns the model's JSON text. */
export type Complete = (input: CompleteInput) => Promise<string>;

interface GroqOptions {
  model?: string;
  /** Read at call time, so the key can be loaded after this module is imported. */
  getApiKey?: () => string | undefined;
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export function createGroqComplete({
  model = 'openai/gpt-oss-120b',
  getApiKey = () => process.env.GROQ_API_KEY,
}: GroqOptions = {}): Complete {
  return async ({ system, user }) => {
    const apiKey = getApiKey();
    if (!apiKey) throw new AppError(500, 'Groq apikey is not set');
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        // Free tier allows 8,000 tokens a minute, input included.
        max_completion_tokens: 4500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    } | null;

    if (response.status === 429) {
      throw new AppError(
        429,
        'Groq rate limit reached. Wait a minute, then upload again'
      );
    }

    if (!response.ok) {
      throw new AppError(
        502,
        `Groq request failed(${response.status}): ${body?.error?.message} ?? 'no details`
      );
    }

    const choice = body?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new AppError(
        422,
        'Your resume is too long to read in one pass. Try a shorter PDF.'
      );
    }
    const content = choice?.message?.content;
    if (!content) throw new AppError(502, 'Groq returned an empty answer');
    return content;
  };
}
