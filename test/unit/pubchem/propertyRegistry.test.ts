import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROPERTIES,
  PROPERTY_ALIASES,
  SUPPORTED_PROPERTIES,
  isSupportedProperty,
  propertiesForPubChem,
  readPropertyValue,
  toPubChemPropertyName,
  validateProperties,
} from '../../../src/pubchem/propertyRegistry.js';
import { PubChemValidationError } from '../../../src/pubchem/pubchemErrors.js';

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

  it('validateProperties throws PubChemValidationError with the supported list', () => {
    try {
      validateProperties(['LethalDose', 'MolecularWeight']);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PubChemValidationError);
      const ve = err as PubChemValidationError;
      expect(ve.category).toBe('validation');
      expect(ve.retryable).toBe(false);
      expect(ve.message).toMatch(/LethalDose/);
      expect(ve.message).toMatch(/Supported names:/);
    }
  });

  it('rejects empty strings as a validation error', () => {
    expect(() => validateProperties([''])).toThrow(PubChemValidationError);
  });

  it('accepts both current and legacy SMILES property names', () => {
    for (const name of ['SMILES', 'ConnectivitySMILES', 'IsomericSMILES', 'CanonicalSMILES']) {
      expect(isSupportedProperty(name)).toBe(true);
    }
    expect(validateProperties(['SMILES', 'ConnectivitySMILES'])).toEqual([
      'SMILES',
      'ConnectivitySMILES',
    ]);
    expect(validateProperties(['CanonicalSMILES', 'IsomericSMILES'])).toEqual([
      'CanonicalSMILES',
      'IsomericSMILES',
    ]);
  });
});

describe('property aliases', () => {
  it('PROPERTY_ALIASES maps legacy → current', () => {
    expect(PROPERTY_ALIASES.CanonicalSMILES).toBe('ConnectivitySMILES');
    expect(PROPERTY_ALIASES.IsomericSMILES).toBe('SMILES');
  });

  it('toPubChemPropertyName translates legacy aliases and passes others through', () => {
    expect(toPubChemPropertyName('CanonicalSMILES')).toBe('ConnectivitySMILES');
    expect(toPubChemPropertyName('IsomericSMILES')).toBe('SMILES');
    expect(toPubChemPropertyName('SMILES')).toBe('SMILES');
    expect(toPubChemPropertyName('MolecularFormula')).toBe('MolecularFormula');
  });

  it('propertiesForPubChem dedupes after alias translation', () => {
    expect(propertiesForPubChem(['CanonicalSMILES', 'ConnectivitySMILES'])).toEqual([
      'ConnectivitySMILES',
    ]);
    expect(propertiesForPubChem(['IsomericSMILES', 'SMILES'])).toEqual(['SMILES']);
    expect(
      propertiesForPubChem(['MolecularFormula', 'CanonicalSMILES', 'CanonicalSMILES']),
    ).toEqual(['MolecularFormula', 'ConnectivitySMILES']);
  });

  it('propertiesForPubChem preserves order of first appearance after translation', () => {
    expect(
      propertiesForPubChem(['ConnectivitySMILES', 'MolecularFormula', 'CanonicalSMILES']),
    ).toEqual(['ConnectivitySMILES', 'MolecularFormula']);
  });
});

describe('readPropertyValue', () => {
  it('returns the value under the current wire key when present', () => {
    const row = { ConnectivitySMILES: 'CCO', SMILES: 'CCO' };
    expect(readPropertyValue(row, 'CanonicalSMILES')).toBe('CCO');
    expect(readPropertyValue(row, 'IsomericSMILES')).toBe('CCO');
    expect(readPropertyValue(row, 'ConnectivitySMILES')).toBe('CCO');
    expect(readPropertyValue(row, 'SMILES')).toBe('CCO');
  });

  it('falls back to the legacy key when the current key is missing', () => {
    const row = { CanonicalSMILES: 'CCO', IsomericSMILES: 'CCO' };
    expect(readPropertyValue(row, 'CanonicalSMILES')).toBe('CCO');
    expect(readPropertyValue(row, 'IsomericSMILES')).toBe('CCO');
    // Caller asking for the current key directly should also resolve via legacy.
    expect(readPropertyValue(row, 'ConnectivitySMILES')).toBe('CCO');
    expect(readPropertyValue(row, 'SMILES')).toBe('CCO');
  });

  it('prefers the current key over a stale legacy key on the same row', () => {
    const row = { CanonicalSMILES: 'STALE', ConnectivitySMILES: 'FRESH' };
    expect(readPropertyValue(row, 'CanonicalSMILES')).toBe('FRESH');
    expect(readPropertyValue(row, 'ConnectivitySMILES')).toBe('FRESH');
  });

  it('returns undefined when neither key is present', () => {
    expect(readPropertyValue({}, 'CanonicalSMILES')).toBeUndefined();
    expect(readPropertyValue({ MolecularFormula: 'C' }, 'SMILES')).toBeUndefined();
  });

  it('treats null and undefined values as missing', () => {
    expect(
      readPropertyValue({ ConnectivitySMILES: null, CanonicalSMILES: 'fallback' }, 'CanonicalSMILES'),
    ).toBe('fallback');
    expect(readPropertyValue({ ConnectivitySMILES: undefined }, 'CanonicalSMILES')).toBeUndefined();
  });
});
