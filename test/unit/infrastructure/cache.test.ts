import { describe, it, expect } from 'vitest';
import { TtlCache } from '../../../src/infrastructure/cache.js';

describe('TtlCache', () => {
  it('returns undefined on miss and increments miss counter', () => {
    const c = new TtlCache<string>({ ttlMs: 1000, maxEntries: 4 });
    expect(c.get('missing')).toBeUndefined();
    expect(c.stats().misses).toBe(1);
  });

  it('stores and retrieves values within TTL', () => {
    let t = 1000;
    const c = new TtlCache<number>({ ttlMs: 100, maxEntries: 4, now: () => t });
    c.set('a', 42);
    t = 1050;
    expect(c.get('a')).toBe(42);
    expect(c.stats().hits).toBe(1);
  });

  it('expires entries after TTL', () => {
    let t = 1000;
    const c = new TtlCache<number>({ ttlMs: 100, maxEntries: 4, now: () => t });
    c.set('a', 1);
    t = 2000;
    expect(c.get('a')).toBeUndefined();
  });

  it('evicts least-recently-used when over capacity', () => {
    const c = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 });
    c.set('a', 1);
    c.set('b', 2);
    // Access a to make it most recent.
    expect(c.get('a')).toBe(1);
    c.set('c', 3); // should evict b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.stats().evictions).toBe(1);
  });

  it('honours the disabled flag', () => {
    const c = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10, disabled: true });
    c.set('a', 1);
    expect(c.get('a')).toBeUndefined();
    expect(c.stats().disabled).toBe(true);
  });

  it('treats ttl=0 or maxEntries=0 as disabled', () => {
    const c1 = new TtlCache<number>({ ttlMs: 0, maxEntries: 10 });
    c1.set('a', 1);
    expect(c1.get('a')).toBeUndefined();
    const c2 = new TtlCache<number>({ ttlMs: 1000, maxEntries: 0 });
    c2.set('a', 1);
    expect(c2.get('a')).toBeUndefined();
  });
});
