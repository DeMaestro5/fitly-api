export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export async function fetchBody<T>(
  url: string,
  opts: FetchOptions = {},
  read: (res: Response) => Promise<T>
): Promise<T> {
  const { headers, timeoutMs = 15000, retries = 3, signal } = opts;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    let status = 0;
    let retryAfter: string | null = null;

    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.ok) return read(res);
      status = res.status;
      retryAfter = res.headers.get('retry-after');
    } catch (err) {
      if (signal?.aborted || attempt >= retries) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    const retryable = status === 429 || status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`HTTP ${status} for ${url}`);
    }
    const seconds = Number(retryAfter);
    const waitMs =
      Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : 1000 * 2 ** attempt;
    await sleep(Math.min(waitMs, 30000));
  }
}
export const fetchJson = <T>(url: string, opts: FetchOptions = {}) =>
  fetchBody<T>(url, opts, (res) => res.json() as Promise<T>);

export const fetchText = (url: string, opts: FetchOptions = {}) =>
  fetchBody<string>(url, opts, (res) => res.text());
