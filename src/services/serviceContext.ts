import type { Config } from '../infrastructure/config.js';
import type { Logger } from '../infrastructure/logger.js';
import type { PugRestClient } from '../pubchem/pugRestClient.js';
import type { PugViewClient } from '../pubchem/pugViewClient.js';

export interface ServiceContext {
  config: Config;
  logger: Logger;
  rest: PugRestClient;
  view: PugViewClient;
}

export function urlConfig(config: Config) {
  return { baseUrl: config.baseUrl, viewBaseUrl: config.viewBaseUrl };
}

export function nowIso(): string {
  return new Date().toISOString();
}
