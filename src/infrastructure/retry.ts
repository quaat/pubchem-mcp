export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const baseDelay = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 16_000;
  const jitter = opts.jitter ?? 0.2;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let attempt = 0;
  // attempt starts at 0; total tries = maxAttempts (so maxAttempts=1 means no retry).
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      if (attempt >= opts.maxAttempts || !opts.shouldRetry(err, attempt)) {
        throw err;
      }
      const exp = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const jitterFactor = 1 + (random() * 2 - 1) * jitter;
      const delay = Math.max(0, Math.round(exp * jitterFactor));
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
}
