import {
  publicCompoundUrl,
} from '../pubchem/pubchemUrls.js';
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
  return {
    cid,
    pubchemUrl: publicCompoundUrl(cid),
    name: asString(row.Title),
    iupacName: asString(row.IUPACName),
    molecularFormula: asString(row.MolecularFormula),
    molecularWeight: asNumber(row.MolecularWeight),
    canonicalSmiles: asString(row.CanonicalSMILES),
    isomericSmiles: asString(row.IsomericSMILES),
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
 * Used by `get_compound_properties` so callers see the exact column set
 * they requested.
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
      const v = row[key];
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
