import { describe, it, expect } from 'vitest';
import {
  PubChemNotFoundError,
  PubChemRateLimitError,
  PubChemTransientError,
  PubChemUnsupportedOperationError,
  PubChemValidationError,
  classifyHttpStatus,
} from '../../../src/pubchem/pubchemErrors.js';

describe('classifyHttpStatus', () => {
  it('returns undefined for 2xx', () => {
    expect(classifyHttpStatus(200)).toBeUndefined();
    expect(classifyHttpStatus(204)).toBeUndefined();
  });

  it('maps documented status codes to typed classes', () => {
    expect(classifyHttpStatus(400)).toBe(PubChemValidationError);
    expect(classifyHttpStatus(404)).toBe(PubChemNotFoundError);
    expect(classifyHttpStatus(405)).toBe(PubChemUnsupportedOperationError);
    expect(classifyHttpStatus(429)).toBe(PubChemRateLimitError);
    expect(classifyHttpStatus(500)).toBe(PubChemTransientError);
    expect(classifyHttpStatus(503)).toBe(PubChemTransientError);
    expect(classifyHttpStatus(501)).toBe(PubChemUnsupportedOperationError);
  });
});

describe('PubChemError instances', () => {
  it('carry category, retryable flag, endpoint and status', () => {
    const e = new PubChemNotFoundError('not found', { endpoint: 'compound/name', status: 404 });
    expect(e.category).toBe('not_found');
    expect(e.retryable).toBe(false);
    expect(e.endpoint).toBe('compound/name');
    expect(e.status).toBe(404);
    expect(e.name).toBe('PubChemNotFoundError');
  });

  it('marks rate limit and transient errors as retryable', () => {
    expect(new PubChemRateLimitError('rate').retryable).toBe(true);
    expect(new PubChemTransientError('5xx').retryable).toBe(true);
    expect(new PubChemValidationError('bad').retryable).toBe(false);
  });
});
