import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../../src/infrastructure/rateLimiter.js';

describe('RateLimiter', () => {
  it('spaces per-second requests', async () => {
    let now = 1_000_000;
    const sleeps: number[] = [];
    const limiter = new RateLimiter({
      rps: 4,
      rpm: 240,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });

    for (let i = 0; i < 4; i++) {
      // Advance time slightly so each call is "back-to-back" with no spacing.
      await limiter.acquire();
    }
    // Spacing is 250ms (1000/4). 4 calls → 3 spaced delays of 250ms each.
    const significantSleeps = sleeps.filter((s) => s > 0);
    expect(significantSleeps.length).toBeGreaterThanOrEqual(3);
    for (const s of significantSleeps) {
      expect(s).toBeGreaterThanOrEqual(250);
    }
  });

  it('enforces the per-minute sliding window', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter({
      rps: 100, // effectively disable per-second spacing
      rpm: 3,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await limiter.acquire(); // t=0
    await limiter.acquire(); // t≈0
    await limiter.acquire(); // t≈0  → window now full
    await limiter.acquire(); // should sleep ~60s until oldest expires
    const bigSleep = sleeps.find((s) => s >= 59_000);
    expect(bigSleep).toBeDefined();
  });

  it('queues acquire() calls so they run serially', async () => {
    let now = 0;
    const limiter = new RateLimiter({
      rps: 2,
      rpm: 240,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    const order: number[] = [];
    const tasks = [0, 1, 2].map((i) =>
      limiter.acquire().then(() => order.push(i)),
    );
    await Promise.all(tasks);
    expect(order).toEqual([0, 1, 2]);
  });

  it('rejects zero or negative rates', () => {
    expect(() => new RateLimiter({ rps: 0, rpm: 1 })).toThrow();
    expect(() => new RateLimiter({ rps: 1, rpm: 0 })).toThrow();
  });
});
