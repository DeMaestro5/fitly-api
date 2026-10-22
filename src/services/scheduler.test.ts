import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScheduler } from './scheduler';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('scheduler', () => {
  it('refreshes on start and on every interval, and stops cleanly', async () => {
    let calls = 0;
    const scheduler = createScheduler({
      sources: [],
      intervalMs: 20,
      refresh: async () => {
        calls++;
        return [];
      },
      log: () => {},
    });

    scheduler.start();
    assert.equal(calls, 1, 'runs once immediately');
    await sleep(110);
    assert.ok(calls >= 3, `expected 3+ runs, got ${calls}`);

    scheduler.stop();
    const callsAtStop = calls;
    await sleep(60);
    assert.equal(calls, callsAtStop, 'no runs after stop');
  });

  it('keeps running after a failed refresh', async () => {
    let calls = 0;
    const logs: string[] = [];
    const scheduler = createScheduler({
      sources: [],
      intervalMs: 20,
      refresh: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return [];
      },
      log: (message) => logs.push(message),
    });

    scheduler.start();
    await sleep(80);
    scheduler.stop();

    assert.ok(calls >= 2, 'the timer survived the failure');
    assert.ok(logs[0].includes('boom'));
  });

  it('starting twice does not create two timers', () => {
    let calls = 0;
    const scheduler = createScheduler({
      sources: [],
      intervalMs: 1000,
      refresh: async () => {
        calls++;
        return [];
      },
      log: () => {},
    });
    scheduler.start();
    scheduler.start();
    scheduler.stop();
    assert.equal(calls, 1);
  });
});
