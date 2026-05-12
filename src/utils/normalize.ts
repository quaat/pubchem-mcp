import {
  publicCompoundUrl,
} from '../pubchem/pubchemUrls.js';
import { readPropertyValue } from '../pubchem/propertyRegistry.js';
import type { NormalizedCompound, PropertyRow } from '../pubchem/pubchemTypes.js';

export interface RawPropertyTable {
  PropertyTable?: {
    Properties?: Array<Record<string, unknown>>;
  };
}

interface RawProperty extends Record<string, unknown> {
  CID?: number;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/**
 * Convert a PUG-REST PropertyTable JSON into normalized compound records.
 * Missing fields are simply omitted (no fabrication).
 */
export function normalizePropertyTable(raw: RawPropertyTable): NormalizedCompound[] {
  const rows = raw.PropertyTable?.Properties ?? [];
  return rows
    .map((row: RawProperty) => normalizeCompoundRow(row))
    .filter((c): c is NormalizedCompound => c !== undefined);
}

export function normalizeCompoundRow(row: RawProperty): NormalizedCompound | undefined {
  const cidRaw = row.CID;
  const cid = typeof cidRaw === 'number' ? cidRaw : asNumber(cidRaw);
  if (cid === undefined || !Number.isInteger(cid) || cid <= 0) return undefined;
  // SMILES property names have been renamed by PubChem:
  //   CanonicalSMILES → ConnectivitySMILES (connectivity-only)
  //   IsomericSMILES  → SMILES             (stereochemical/isotopic)
  // Prefer the current keys; fall back to legacy keys for back-compat with
  // fixtures or cached responses captured before the rename.
  return {
    cid,
    pubchemUrl: publicCompoundUrl(cid),
    name: asString(row.Title),
    iupacName: asString(row.IUPACName),
    molecularFormula: asString(row.MolecularFormula),
    molecularWeight: asNumber(row.MolecularWeight),
    canonicalSmiles: asString(readPropertyValue(row, 'CanonicalSMILES')),
    isomericSmiles: asString(readPropertyValue(row, 'IsomericSMILES')),
    inchi: asString(row.InChI),
    inchiKey: asString(row.InChIKey),
    xlogp: asNumber(row.XLogP),
    tpsa: asNumber(row.TPSA),
    complexity: asNumber(row.Complexity),
    charge: asNumber(row.Charge),
    hBondDonorCount: asNumber(row.HBondDonorCount),
    hBondAcceptorCount: asNumber(row.HBondAcceptorCount),
    rotatableBondCount: asNumber(row.RotatableBondCount),
    heavyAtomCount: asNumber(row.HeavyAtomCount),
  };
}

/**
 * Generic property-row normalizer that preserves only the requested keys.
 *
 * Used by `get_compound_properties` so callers see exactly the column set
 * they asked for. Legacy property aliases (e.g. `CanonicalSMILES`) are
 * supported: the response row may carry the value under PubChem's current
 * name (`ConnectivitySMILES`), and `readPropertyValue` resolves it back to
 * the requested alias key. Requesting only the current name still works as
 * well.
 */
export function rowsForProperties(
  raw: RawPropertyTable,
  requested: ReadonlyArray<string>,
): PropertyRow[] {
  const rows = raw.PropertyTable?.Properties ?? [];
  const out: PropertyRow[] = [];
  for (const row of rows) {
    const cidRaw = (row as RawProperty).CID;
    const cid = typeof cidRaw === 'number' ? cidRaw : asNumber(cidRaw);
    if (cid === undefined) continue;
    const props: Record<string, string | number | undefined> = {};
    for (const key of requested) {
      const v = readPropertyValue(row, key);
      if (v === undefined || v === null) continue;
      if (typeof v === 'number' || typeof v === 'string') {
        props[key] = v;
      } else {
        props[key] = String(v);
      }
    }
    out.push({ cid, pubchemUrl: publicCompoundUrl(cid), properties: props });
  }
  return out;
}
