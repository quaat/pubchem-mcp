import { describe, it, expect } from 'vitest';
import { createLogger } from '../../../src/infrastructure/logger.js';

describe('createLogger', () => {
  it('creates a pino logger at the configured level', () => {
    const log = createLogger({ logLevel: 'warn' });
    expect(log.level).toBe('warn');
    // Smoke: should not throw.
    log.info('test');
  });
});
