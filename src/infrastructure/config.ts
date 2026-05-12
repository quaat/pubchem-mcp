import { z } from 'zod';

const PUBCHEM_DEFAULTS = {
  baseUrl: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug',
  viewBaseUrl: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view',
  rps: 4,
  rpm: 240,
  timeoutMs: 30_000,
  maxRetries: 4,
  cacheTtlMs: 86_400_000,
  cacheMaxEntries: 1000,
  logLevel: 'info' as const,
};

const HARD_RPS_CAP = 5;
const HARD_RPM_CAP = 400;

const boolish = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => v === '1' || v === 'true' || v === true);

const intFromString = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max);

export const ConfigSchema = z
  .object({
    PUBCHEM_BASE_URL: z.string().url().default(PUBCHEM_DEFAULTS.baseUrl),
    PUBCHEM_VIEW_BASE_URL: z.string().url().default(PUBCHEM_DEFAULTS.viewBaseUrl),
    PUBCHEM_RPS: intFromString(1, HARD_RPS_CAP).default(PUBCHEM_DEFAULTS.rps),
    PUBCHEM_RPM: intFromString(1, HARD_RPM_CAP).default(PUBCHEM_DEFAULTS.rpm),
    PUBCHEM_TIMEOUT_MS: intFromString(1_000, 120_000).default(PUBCHEM_DEFAULTS.timeoutMs),
    PUBCHEM_MAX_RETRIES: intFromString(0, 10).default(PUBCHEM_DEFAULTS.maxRetries),
    PUBCHEM_CACHE_TTL_MS: intFromString(0, 7 * 86_400_000).default(PUBCHEM_DEFAULTS.cacheTtlMs),
    PUBCHEM_CACHE_DISABLE: boolish.default(false),
    PUBCHEM_CACHE_MAX_ENTRIES: intFromString(0, 100_000).default(PUBCHEM_DEFAULTS.cacheMaxEntries),
    PUBCHEM_CONTACT_URL: z.string().url().optional(),
    PUBCHEM_LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default(PUBCHEM_DEFAULTS.logLevel),
  })
  .transform((env) => ({
    baseUrl: env.PUBCHEM_BASE_URL.replace(/\/+$/, ''),
    viewBaseUrl: env.PUBCHEM_VIEW_BASE_URL.replace(/\/+$/, ''),
    rps: env.PUBCHEM_RPS,
    rpm: env.PUBCHEM_RPM,
    timeoutMs: env.PUBCHEM_TIMEOUT_MS,
    maxRetries: env.PUBCHEM_MAX_RETRIES,
    cacheTtlMs: env.PUBCHEM_CACHE_TTL_MS,
    cacheDisabled: env.PUBCHEM_CACHE_DISABLE,
    cacheMaxEntries: env.PUBCHEM_CACHE_MAX_ENTRIES,
    contactUrl: env.PUBCHEM_CONTACT_URL,
    logLevel: env.PUBCHEM_LOG_LEVEL,
  }));

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}

export const HARD_LIMITS = {
  rps: HARD_RPS_CAP,
  rpm: HARD_RPM_CAP,
};
