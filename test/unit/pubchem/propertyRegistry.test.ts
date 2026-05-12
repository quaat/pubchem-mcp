import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROPERTIES,
  SUPPORTED_PROPERTIES,
  isSupportedProperty,
  validateProperties,
} from '../../../src/pubchem/propertyRegistry.js';

describe('propertyRegistry', () => {
  it('exposes the default property set within the supported list', () => {
    for (const p of DEFAULT_PROPERTIES) {
      expect(SUPPORTED_PROPERTIES).toContain(p);
    }
  });

  it('isSupportedProperty narrows correctly', () => {
    expect(isSupportedProperty('MolecularWeight')).toBe(true);
    expect(isSupportedProperty('NotAThing')).toBe(false);
  });

  it('validateProperties dedupes and preserves order', () => {
    const out = validateProperties(['XLogP', 'MolecularWeight', 'XLogP']);
    expect(out).toEqual(['XLogP', 'MolecularWeight']);
  });

  it('validateProperties throws with the supported list in the message', () => {
    try {
      validateProperties(['LethalDose', 'MolecularWeight']);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/LethalDose/);
      expect((err as Error).message).toMatch(/MolecularWeight/);
      expect((err as Error).message).toMatch(/Supported names:/);
    }
  });

  it('rejects empty strings', () => {
    expect(() => validateProperties([''])).toThrow();
  });
});
