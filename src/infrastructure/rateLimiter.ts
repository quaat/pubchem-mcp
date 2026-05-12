export interface RateLimiterOptions {
  rps: number;
  rpm: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two-tier rate limiter:
 *   - per-second: minimum spacing of 1000/rps ms between requests
 *   - per-minute: sliding 60s window with rpm cap
 * Requests queue serially (acquire() is awaited in order) so we never burst.
 */
export class RateLimiter {
  private readonly rps: number;
  private readonly rpm: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minSpacingMs: number;
  private lastRequestAt = 0;
  private windowStamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    if (opts.rps <= 0) throw new Error('rps must be > 0');
    if (opts.rpm <= 0) throw new Error('rpm must be > 0');
    this.rps = opts.rps;
    this.rpm = opts.rpm;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
    this.minSpacingMs = Math.ceil(1000 / this.rps);
  }

  acquire(): Promise<void> {
    const next = this.chain.then(() => this.wait());
    // Swallow rejection on the chain so a single failure doesn't poison subsequent waits.
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async wait(): Promise<void> {
    const now = this.now();
    const sincePrev = now - this.lastRequestAt;
    const spacingDelay = sincePrev < this.minSpacingMs ? this.minSpacingMs - sincePrev : 0;

    // Sliding-window check: drop stamps older than 60s.
    const windowStart = now - 60_000;
    this.windowStamps = this.windowStamps.filter((t) => t > windowStart);

    let windowDelay = 0;
    if (this.windowStamps.length >= this.rpm) {
      const oldest = this.windowStamps[0];
      if (oldest !== undefined) {
        windowDelay = Math.max(0, oldest + 60_000 - now);
      }
    }

    const delay = Math.max(spacingDelay, windowDelay);
    if (delay > 0) {
      await this.sleep(delay);
    }

    const stamp = this.now();
    this.lastRequestAt = stamp;
    this.windowStamps.push(stamp);
  }

  snapshot(): { lastRequestAt: number; windowCount: number } {
    return {
      lastRequestAt: this.lastRequestAt,
      windowCount: this.windowStamps.length,
    };
  }
}
