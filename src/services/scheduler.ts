import type { JobSource } from '../sources/source.type';
import { refreshAll, type RefreshReport } from './jobs-refresh-service';

export const DEFAULT_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

export interface SchedulerOptions {
  sources: JobSource[];
  intervalMs?: number;
  // Injectable so tests never touch the network.
  refresh?: (sources: JobSource[]) => Promise<RefreshReport[]>;
  log?: (message: string) => void;
}

export interface Scheduler {
  start(): void;
  stop(): void;
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const refresh = options.refresh ?? ((sources) => refreshAll(sources));
  const log = options.log ?? ((message) => console.log(message));
  let timer: ReturnType<typeof setInterval> | null = null;

  // Never throws: one bad run must not kill the timer.
  async function tick(): Promise<void> {
    try {
      const reports = await refresh(options.sources);
      log(
        `[scheduler] ${reports.map((r) => `${r.source}=${r.outcome}`).join(' ')}`,
      );
    } catch (err) {
      log(
        `[scheduler] refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    start() {
      if (timer) return; // starting twice must not create two timers
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref(); // the timer alone never keeps the process alive
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
