import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

type MswServer = ReturnType<typeof setupServer>;
import { TtlCache } from '../../src/infrastructure/cache.js';
import { RateLimiter } from '../../src/infrastructure/rateLimiter.js';
import { ThrottleStateTracker } from '../../src/infrastructure/throttling.js';
import { loadConfig } from '../../src/infrastructure/config.js';
import { createLogger } from '../../src/infrastructure/logger.js';
import { PugRestClient, type CachedEntry } from '../../src/pubchem/pugRestClient.js';
import { PugViewClient } from '../../src/pubchem/pugViewClient.js';
import type { ServiceContext } from '../../src/services/serviceContext.js';

export const TEST_BASE = 'https://pubchem.test/rest/pug';
export const TEST_VIEW = 'https://pubchem.test/rest/pug_view';

export function makeServiceContext(): ServiceContext {
  const config = loadConfig({
    PUBCHEM_BASE_URL: TEST_BASE,
    PUBCHEM_VIEW_BASE_URL: TEST_VIEW,
    PUBCHEM_LOG_LEVEL: 'silent',
    PUBCHEM_TIMEOUT_MS: '5000',
    PUBCHEM_MAX_RETRIES: '2',
  } as NodeJS.ProcessEnv);
  const cache = new TtlCache<CachedEntry>({ ttlMs: 60_000, maxEntries: 100 });
  const logger = createLogger({ logLevel: 'silent' });
  const rateLimiter = new RateLimiter({ rps: 100, rpm: 240, sleep: async () => undefined });
  const throttle = new ThrottleStateTracker();
  const rest = new PugRestClient({
    config,
    cache,
    logger,
    rateLimiter,
    throttle,
    sleep: async () => undefined,
    random: () => 0.5,
    userAgentVersion: '0.0.0-test',
  });
  const view = new PugViewClient({
    config,
    cache,
    logger,
    rateLimiter,
    throttle,
    sleep: async () => undefined,
    random: () => 0.5,
    userAgentVersion: '0.0.0-test',
  });
  return { config, logger, rest, view };
}

export function installMswLifecycle(server: MswServer): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

export { setupServer };
