export type ThrottleStatus = 'green' | 'yellow' | 'red' | 'black' | 'unknown';

export interface ParsedThrottleControl {
  raw: string;
  status: ThrottleStatus;
  /** Numeric pressures parsed from "Request Count status: Green (10%)" segments, 0-100. */
  requestCountPercent?: number;
  requestTimePercent?: number;
  serviceStatusPercent?: number;
  /** Worst color across all reported categories, used to drive backoff. */
  worstStatus: ThrottleStatus;
}

const STATUS_ORDER: ThrottleStatus[] = ['unknown', 'green', 'yellow', 'red', 'black'];

function statusFromWord(word: string): ThrottleStatus {
  const w = word.trim().toLowerCase();
  if (w === 'green' || w === 'yellow' || w === 'red' || w === 'black') return w;
  return 'unknown';
}

function worse(a: ThrottleStatus, b: ThrottleStatus): ThrottleStatus {
  return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b;
}

/**
 * Parse PubChem's X-Throttling-Control header.
 *
 * Documented format (PubChem dynamic-request-throttling docs):
 *   Request Count status: Green (10%), Request Time status: Green (5%), Service status: Green (20%)
 *
 * We tolerate variations: missing fields, lower-case status words, alternate ordering.
 * Returns `undefined` if the header is empty/missing.
 */
export function parseThrottlingControl(headerValue: string | null | undefined): ParsedThrottleControl | undefined {
  if (!headerValue) return undefined;
  const raw = headerValue.trim();
  if (!raw) return undefined;

  const result: ParsedThrottleControl = {
    raw,
    status: 'unknown',
    worstStatus: 'unknown',
  };

  // Each segment looks like "<label>: <Color> (<n>%)"; split on commas.
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const match = segment.match(/^(.+?)\s*:\s*([A-Za-z]+)(?:\s*\((\d+)\s*%\))?$/);
    if (!match) continue;
    const labelRaw = match[1]?.toLowerCase() ?? '';
    const colorWord = match[2] ?? '';
    const pctStr = match[3];
    const status = statusFromWord(colorWord);
    const percent = pctStr !== undefined ? Number.parseInt(pctStr, 10) : undefined;

    if (labelRaw.includes('request') && labelRaw.includes('count')) {
      if (percent !== undefined) result.requestCountPercent = percent;
    } else if (labelRaw.includes('request') && labelRaw.includes('time')) {
      if (percent !== undefined) result.requestTimePercent = percent;
    } else if (labelRaw.includes('service')) {
      if (percent !== undefined) result.serviceStatusPercent = percent;
    }
    result.worstStatus = worse(result.worstStatus, status);
  }

  result.status = result.worstStatus;
  return result;
}

/**
 * Sleep duration suggested for the next request given the most recently observed throttle state.
 * Conservative: green=0, yellow=200ms, red=1000ms, black=5000ms.
 */
export function suggestedBackoffMs(state: ParsedThrottleControl | undefined): number {
  if (!state) return 0;
  switch (state.worstStatus) {
    case 'yellow':
      return 200;
    case 'red':
      return 1000;
    case 'black':
      return 5000;
    default:
      return 0;
  }
}

export class ThrottleStateTracker {
  private last: ParsedThrottleControl | undefined;
  private lastUpdatedAt: number | undefined;

  update(headerValue: string | null | undefined, now: number = Date.now()): void {
    const parsed = parseThrottlingControl(headerValue);
    if (parsed) {
      this.last = parsed;
      this.lastUpdatedAt = now;
    }
  }

  current(): ParsedThrottleControl | undefined {
    return this.last;
  }

  snapshot(): { state: ParsedThrottleControl | undefined; updatedAt: number | undefined } {
    return { state: this.last, updatedAt: this.lastUpdatedAt };
  }
}
