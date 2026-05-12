import { describe, it, expect } from 'vitest';
import {
  normalizePropertyTable,
  rowsForProperties,
} from '../../../src/utils/normalize.js';

const sample = {
  PropertyTable: {
    Properties: [
      {
        CID: 2244,
        MolecularFormula: 'C9H8O4',
        MolecularWeight: '180.16',
        CanonicalSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
        IsomericSMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O',
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

describe('normalizePropertyTable', () => {
  it('maps PUG-REST properties to NormalizedCompound', () => {
    const [c] = normalizePropertyTable(sample);
    expect(c).toBeDefined();
    expect(c!.cid).toBe(2244);
    expect(c!.molecularFormula).toBe('C9H8O4');
    expect(c!.molecularWeight).toBe(180.16);
    expect(c!.inchiKey).toBe('BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    expect(c!.name).toBe('Aspirin');
    expect(c!.pubchemUrl).toBe('https://pubchem.ncbi.nlm.nih.gov/compound/2244');
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
  });
});

describe('rowsForProperties', () => {
  it('preserves only requested keys', () => {
    const rows = rowsForProperties(sample, ['MolecularFormula', 'XLogP']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.properties).toEqual({ MolecularFormula: 'C9H8O4', XLogP: 1.2 });
    expect(Object.keys(rows[0]!.properties)).toEqual(['MolecularFormula', 'XLogP']);
  });
});
