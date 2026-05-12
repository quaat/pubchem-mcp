import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/infrastructure/config.js';

describe('loadConfig', () => {
  it('applies safe defaults when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.baseUrl).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug');
    expect(cfg.viewBaseUrl).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug_view');
    expect(cfg.rps).toBe(4);
    expect(cfg.rpm).toBe(240);
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.maxRetries).toBe(4);
    expect(cfg.cacheTtlMs).toBe(86_400_000);
    expect(cfg.cacheDisabled).toBe(false);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.contactUrl).toBeUndefined();
  });

  it('parses overrides', () => {
    const cfg = loadConfig({
      PUBCHEM_RPS: '5',
      PUBCHEM_RPM: '300',
      PUBCHEM_TIMEOUT_MS: '10000',
      PUBCHEM_CACHE_DISABLE: '1',
      PUBCHEM_CONTACT_URL: 'https://example.com/contact',
      PUBCHEM_LOG_LEVEL: 'debug',
    } as NodeJS.ProcessEnv);
    expect(cfg.rps).toBe(5);
    expect(cfg.rpm).toBe(300);
    expect(cfg.timeoutMs).toBe(10_000);
    expect(cfg.cacheDisabled).toBe(true);
    expect(cfg.contactUrl).toBe('https://example.com/contact');
    expect(cfg.logLevel).toBe('debug');
  });

  it('rejects rps above the hard cap', () => {
    expect(() => loadConfig({ PUBCHEM_RPS: '10' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('rejects rpm above the hard cap', () => {
    expect(() => loadConfig({ PUBCHEM_RPM: '999' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('rejects invalid log levels', () => {
    expect(() =>
      loadConfig({ PUBCHEM_LOG_LEVEL: 'shouty' } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('trims trailing slashes from base URLs', () => {
    const cfg = loadConfig({
      PUBCHEM_BASE_URL: 'https://example.org/pug///',
    } as NodeJS.ProcessEnv);
    expect(cfg.baseUrl).toBe('https://example.org/pug');
  });
});
