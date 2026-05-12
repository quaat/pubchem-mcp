import { describe, it, expect } from 'vitest';
import { detectIdentifierType, parseCid } from '../../../src/utils/ids.js';

describe('detectIdentifierType', () => {
  it('detects InChI', () => {
    expect(detectIdentifierType('InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)')).toBe(
      'inchi',
    );
  });

  it('detects InChIKey', () => {
    expect(detectIdentifierType('BSYNRYMUTXBXSQ-UHFFFAOYSA-N')).toBe('inchikey');
  });

  it('detects CID for short digit strings', () => {
    expect(detectIdentifierType('2244')).toBe('cid');
    expect(detectIdentifierType('1')).toBe('cid');
  });

  it('detects molecular formula', () => {
    expect(detectIdentifierType('C9H8O4')).toBe('formula');
    expect(detectIdentifierType('H2O')).toBe('formula');
  });

  it('detects SMILES with bond/branch/ring chars', () => {
    expect(detectIdentifierType('CC(=O)Oc1ccccc1C(=O)O')).toBe('smiles');
    expect(detectIdentifierType('c1ccccc1')).toBe('smiles');
  });

  it('falls back to name for plain words', () => {
    expect(detectIdentifierType('aspirin')).toBe('name');
    expect(detectIdentifierType('caffeine')).toBe('name');
    expect(detectIdentifierType('Acetylsalicylic acid')).toBe('name');
  });

  it('treats long digit strings as names (not CID) to avoid false positives', () => {
    expect(detectIdentifierType('1234567890')).toBe('name');
  });
});

describe('parseCid', () => {
  it('accepts positive integers', () => {
    expect(parseCid(2244)).toBe(2244);
    expect(parseCid('2244')).toBe(2244);
  });
  it('rejects non-positive and non-integer values', () => {
    expect(() => parseCid(0)).toThrow();
    expect(() => parseCid(-1)).toThrow();
    expect(() => parseCid('abc')).toThrow();
    expect(() => parseCid(1.5)).toThrow();
  });
});
