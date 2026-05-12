import { describe, it, expect } from 'vitest';
import {
  ThrottleStateTracker,
  parseThrottlingControl,
  suggestedBackoffMs,
} from '../../../src/infrastructure/throttling.js';

describe('parseThrottlingControl', () => {
  it('returns undefined for empty/null input', () => {
    expect(parseThrottlingControl(undefined)).toBeUndefined();
    expect(parseThrottlingControl(null)).toBeUndefined();
    expect(parseThrottlingControl('')).toBeUndefined();
  });

  it('parses the documented three-segment format (all green)', () => {
    const r = parseThrottlingControl(
      'Request Count status: Green (10%), Request Time status: Green (5%), Service status: Green (20%)',
    );
    expect(r).toBeDefined();
    expect(r!.status).toBe('green');
    expect(r!.requestCountPercent).toBe(10);
    expect(r!.requestTimePercent).toBe(5);
    expect(r!.serviceStatusPercent).toBe(20);
    expect(r!.worstStatus).toBe('green');
  });

  it('reports the worst status across segments', () => {
    const r = parseThrottlingControl(
      'Request Count status: Yellow (60%), Request Time status: Red (80%), Service status: Green (10%)',
    );
    expect(r!.worstStatus).toBe('red');
  });

  it('handles missing percentages gracefully', () => {
    const r = parseThrottlingControl('Request Count status: Yellow, Service status: Green (10%)');
    expect(r!.worstStatus).toBe('yellow');
    expect(r!.requestCountPercent).toBeUndefined();
    expect(r!.serviceStatusPercent).toBe(10);
  });

  it('treats unknown color words as unknown but keeps parsing', () => {
    const r = parseThrottlingControl('Request Count status: Pink (50%)');
    expect(r!.worstStatus).toBe('unknown');
  });

  it('parses Black status', () => {
    const r = parseThrottlingControl('Service status: Black (100%)');
    expect(r!.worstStatus).toBe('black');
  });
});

describe('suggestedBackoffMs', () => {
  it('returns 0 for green and undefined', () => {
    expect(suggestedBackoffMs(undefined)).toBe(0);
    expect(
      suggestedBackoffMs(parseThrottlingControl('Service status: Green (1%)')),
    ).toBe(0);
  });

  it('scales up with worse statuses', () => {
    expect(
      suggestedBackoffMs(parseThrottlingControl('Service status: Yellow (60%)')),
    ).toBeGreaterThan(0);
    const red = suggestedBackoffMs(
      parseThrottlingControl('Service status: Red (80%)'),
    );
    const black = suggestedBackoffMs(
      parseThrottlingControl('Service status: Black (100%)'),
    );
    expect(red).toBeGreaterThan(100);
    expect(black).toBeGreaterThan(red);
  });
});

describe('ThrottleStateTracker', () => {
  it('updates only when given a parseable header', () => {
    const tracker = new ThrottleStateTracker();
    tracker.update(undefined);
    expect(tracker.current()).toBeUndefined();
    tracker.update('Service status: Yellow (55%)', 1000);
    expect(tracker.current()?.worstStatus).toBe('yellow');
    expect(tracker.snapshot().updatedAt).toBe(1000);
  });
});
