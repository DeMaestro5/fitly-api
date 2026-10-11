export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
  /** Optional: a wait time the error itself asks for (for example a rate-limit hint). */
  getDelayMs?: (err: unknown) => number | null;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  { retries, baseDelayMs, shouldRetry, getDelayMs }: RetryOptions
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const hinted = getDelayMs?.(err) ?? null;
      const delay =
        hinted ?? baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await sleep(delay);
      attempt += 1;
    }
  }
}
