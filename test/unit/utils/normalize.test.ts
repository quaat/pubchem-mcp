import { describe, it, expect } from 'vitest';
import {
  normalizePropertyTable,
  rowsForProperties,
} from '../../../src/utils/normalize.js';

// Current PubChem wire shape (post SMILES property rename):
//   IsomericSMILES   → SMILES
//   CanonicalSMILES  → ConnectivitySMILES
const currentSample = {
  PropertyTable: {
    Properties: [
      {
        CID: 2244,
        MolecularFormula: 'C9H8O4',
        MolecularWeight: '180.16',
        ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        InChI:
          'InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)',
        InChIKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
        IUPACName: '2-acetyloxybenzoic acid',
        XLogP: 1.2,
        TPSA: 63.6,
        Complexity: 212,
        HBondDonorCount: 1,
        HBondAcceptorCount: 4,
        RotatableBondCount: 3,
        HeavyAtomCount: 13,
        Title: 'Aspirin',
      },
    ],
  },
};

// Legacy fixture (pre-rename shape) kept explicitly so the back-compat path
// stays exercised. Production code must continue to accept this until we
// know no caller or cache still serves it.
const legacySample = {
  PropertyTable: {
    Properties: [
      {
        CID: 2244,
        MolecularFormula: 'C9H8O4',
        MolecularWeight: '180.16',
        CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        IsomericSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        InChIKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
        Title: 'Aspirin',
      },
    ],
  },
};

describe('normalizePropertyTable (current PubChem keys)', () => {
  it('maps PUG-REST current-name properties to NormalizedCompound', () => {
    const [c] = normalizePropertyTable(currentSample);
    expect(c).toBeDefined();
    expect(c!.cid).toBe(2244);
    expect(c!.molecularFormula).toBe('C9H8O4');
    expect(c!.molecularWeight).toBe(180.16);
    expect(c!.inchiKey).toBe('BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    expect(c!.name).toBe('Aspirin');
    expect(c!.pubchemUrl).toBe('https://pubchem.ncbi.nlm.nih.gov/compound/2244');
    // ConnectivitySMILES → canonicalSmiles, SMILES → isomericSmiles.
    expect(c!.canonicalSmiles).toBe('CC(=O)OC1=CC=CC=C1C(=O)O');
    expect(c!.isomericSmiles).toBe('CC(=O)OC1=CC=CC=C1C(=O)O');
  });

  it('skips rows without a CID', () => {
    const out = normalizePropertyTable({ PropertyTable: { Properties: [{ MolecularWeight: 1 }] } });
    expect(out).toEqual([]);
  });

  it('omits missing fields rather than fabricating', () => {
    const [c] = normalizePropertyTable({
      PropertyTable: { Properties: [{ CID: 5793, MolecularFormula: 'C9H8' }] },
    });
    expect(c!.molecularWeight).toBeUndefined();
    expect(c!.canonicalSmiles).toBeUndefined();
    expect(c!.isomericSmiles).toBeUndefined();
  });

  it('prefers the new key when both new and legacy SMILES keys are present', () => {
    const mixed = {
      PropertyTable: {
        Properties: [
          {
            CID: 1,
            CanonicalSMILES: 'STALE-CANON',
            ConnectivitySMILES: 'FRESH-CONN',
            IsomericSMILES: 'STALE-ISO',
            SMILES: 'FRESH-SMILES',
          },
        ],
      },
    };
    const [c] = normalizePropertyTable(mixed);
    expect(c!.canonicalSmiles).toBe('FRESH-CONN');
    expect(c!.isomericSmiles).toBe('FRESH-SMILES');
  });
});

describe('normalizePropertyTable (legacy PubChem keys — back-compat regression)', () => {
  it('still populates SMILES fields from CanonicalSMILES/IsomericSMILES', () => {
    const [c] = normalizePropertyTable(legacySample);
    expect(c).toBeDefined();
    expect(c!.canonicalSmiles).toBe('CC(=O)OC1=CC=CC=C1C(=O)O');
    expect(c!.isomericSmiles).toBe('CC(=O)OC1=CC=CC=C1C(=O)O');
  });
});

describe('rowsForProperties', () => {
  it('preserves only requested keys', () => {
    const rows = rowsForProperties(currentSample, ['MolecularFormula', 'XLogP']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.properties).toEqual({ MolecularFormula: 'C9H8O4', XLogP: 1.2 });
    expect(Object.keys(rows[0]!.properties)).toEqual(['MolecularFormula', 'XLogP']);
  });

  it('populates requested legacy CanonicalSMILES from current ConnectivitySMILES response key', () => {
    const rows = rowsForProperties(currentSample, ['CanonicalSMILES']);
    expect(rows[0]!.properties).toEqual({ CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O' });
  });

  it('populates requested legacy IsomericSMILES from current SMILES response key', () => {
    const rows = rowsForProperties(currentSample, ['IsomericSMILES']);
    expect(rows[0]!.properties).toEqual({ IsomericSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O' });
  });

  it('returns current names when current names are requested', () => {
    const rows = rowsForProperties(currentSample, ['SMILES', 'ConnectivitySMILES']);
    expect(rows[0]!.properties).toEqual({
      SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
    });
  });

  it('returns both legacy and current alias columns when both are requested (no row duplication)', () => {
    const rows = rowsForProperties(currentSample, [
      'CanonicalSMILES',
      'ConnectivitySMILES',
      'IsomericSMILES',
      'SMILES',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.properties).toEqual({
      CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      IsomericSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
    });
  });

  it('falls back to legacy response keys when current keys are absent (back-compat)', () => {
    const rows = rowsForProperties(legacySample, ['CanonicalSMILES', 'ConnectivitySMILES']);
    expect(rows[0]!.properties).toEqual({
      CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
      ConnectivitySMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
    });
  });
});
