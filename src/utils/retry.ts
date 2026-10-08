export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  { retries, baseDelayMs, shouldRetry }: RetryOptions
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await sleep(delay);
      attempt += 1;
    }
  }
}
