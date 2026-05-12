import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../src/infrastructure/retry.js';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, {
      maxAttempts: 3,
      shouldRetry: () => true,
      sleep: async () => undefined,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('flaky');
        return 'done';
      },
      {
        maxAttempts: 5,
        shouldRetry: () => true,
        sleep: async () => undefined,
        random: () => 0.5,
      },
    );
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('stops when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fatal');
    });
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        shouldRetry: () => false,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caps total attempts at maxAttempts', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always');
    });
    await expect(
      withRetry(fn, {
        maxAttempts: 4,
        shouldRetry: () => true,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('always');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('computes exponential backoff with jitter within bounds', async () => {
    const delays: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw new Error('boom');
        },
        {
          maxAttempts: 4,
          baseDelayMs: 100,
          maxDelayMs: 10_000,
          jitter: 0.2,
          shouldRetry: () => true,
          sleep: async (ms) => {
            delays.push(ms);
          },
          random: () => 0.5, // jitterFactor = 1 exactly
        },
      ),
    ).rejects.toThrow('boom');
    // attempts 1..3 produce sleeps after them: 100, 200, 400 with jitterFactor=1
    expect(delays).toEqual([100, 200, 400]);
  });

  it('passes attempt index to shouldRetry', async () => {
    const observed: number[] = [];
    await expect(
      withRetry(
        async () => {
          throw new Error('x');
        },
        {
          maxAttempts: 3,
          shouldRetry: (_e, attempt) => {
            observed.push(attempt);
            return true;
          },
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow();
    expect(observed).toEqual([1, 2]);
  });
});
