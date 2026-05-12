import { PubChemValidationError } from './pubchemErrors.js';

/**
 * Allowlist of PubChem compound property names we expose. This protects
 * downstream callers from typos and protects PubChem from arbitrary
 * property strings ending up in URLs.
 *
 * Names match PubChem's documented property table identifiers. Both the
 * current names (`SMILES`, `ConnectivitySMILES`) and the legacy aliases
 * (`IsomericSMILES`, `CanonicalSMILES`) are accepted — see PROPERTY_ALIASES
 * below for the mapping rules used both on the wire and when reading
 * response rows.
 */

export const SUPPORTED_PROPERTIES = [
  'MolecularFormula',
  'MolecularWeight',
  // Current PubChem SMILES property names.
  'SMILES',
  'ConnectivitySMILES',
  // Legacy aliases — still accepted for backward compatibility. PubChem now
  // serves their values under the current names above; the helpers in this
  // file translate aliases at the wire boundary and read the right keys back.
  'CanonicalSMILES',
  'IsomericSMILES',
  'InChI',
  'InChIKey',
  'IUPACName',
  'XLogP',
  'ExactMass',
  'MonoisotopicMass',
  'TPSA',
  'Complexity',
  'Charge',
  'HBondDonorCount',
  'HBondAcceptorCount',
  'RotatableBondCount',
  'HeavyAtomCount',
  'IsotopeAtomCount',
  'AtomStereoCount',
  'DefinedAtomStereoCount',
  'UndefinedAtomStereoCount',
  'BondStereoCount',
  'DefinedBondStereoCount',
  'UndefinedBondStereoCount',
  'CovalentUnitCount',
  'Volume3D',
  'XStericQuadrupole3D',
  'YStericQuadrupole3D',
  'ZStericQuadrupole3D',
  'FeatureCount3D',
  'FeatureAcceptorCount3D',
  'FeatureDonorCount3D',
  'FeatureAnionCount3D',
  'FeatureCationCount3D',
  'FeatureRingCount3D',
  'FeatureHydrophobeCount3D',
  'ConformerModelRMSD3D',
  'EffectiveRotorCount3D',
  'ConformerCount3D',
  'Fingerprint2D',
  'Title',
] as const;

export type SupportedProperty = (typeof SUPPORTED_PROPERTIES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_PROPERTIES);

/**
 * Legacy-name → current-name mapping for properties PubChem has renamed.
 *
 *  - `IsomericSMILES` → `SMILES`             (stereochemical / isotopic SMILES)
 *  - `CanonicalSMILES` → `ConnectivitySMILES` (connectivity-only SMILES)
 *
 * The mapping is used in two places:
 *   1. URL construction: requests are translated to current names so PubChem
 *      receives its current vocabulary on the wire.
 *   2. Response reading: response rows are populated under the current keys,
 *      so when a caller requests `CanonicalSMILES` we look at the row's
 *      `ConnectivitySMILES` field (and fall back to `CanonicalSMILES` for
 *      fixtures captured before the rename).
 */
export const PROPERTY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  IsomericSMILES: 'SMILES',
  CanonicalSMILES: 'ConnectivitySMILES',
});

// Reverse lookup: current wire name → all legacy aliases that map to it.
// Used when reading values from a row so we can fall back to legacy keys
// even when the caller asked for the current name.
const REVERSE_ALIASES: Readonly<Record<string, ReadonlyArray<string>>> = (() => {
  const out: Record<string, string[]> = {};
  for (const [legacy, current] of Object.entries(PROPERTY_ALIASES)) {
    (out[current] ??= []).push(legacy);
  }
  return Object.freeze(
    Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.freeze(v)])),
  );
})();

/**
 * Translate a possibly-legacy property name to the name PubChem currently
 * uses on the wire. Non-aliased names pass through unchanged.
 */
export function toPubChemPropertyName(property: string): string {
  return PROPERTY_ALIASES[property] ?? property;
}

/**
 * Given a list of requested property names, return the unique, ordered list
 * of names to send to PubChem. Legacy aliases are translated to current
 * names; duplicates (after translation) are dropped while preserving the
 * order of first appearance.
 */
export function propertiesForPubChem(
  requested: ReadonlyArray<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of requested) {
    const wire = toPubChemPropertyName(name);
    if (seen.has(wire)) continue;
    seen.add(wire);
    out.push(wire);
  }
  return out;
}

/**
 * Read a property value from a PubChem response row, honoring the alias
 * mapping. We always prefer the current wire name; if absent, we fall back
 * to the legacy name so that fixtures captured before PubChem's rename
 * continue to work (and so the function tolerates either side returning
 * legacy data).
 */
export function readPropertyValue(
  row: Record<string, unknown>,
  requestedProperty: string,
): unknown {
  const wire = toPubChemPropertyName(requestedProperty);
  // Try the current wire name first.
  if (wire in row && row[wire] !== undefined && row[wire] !== null) {
    return row[wire];
  }
  // Then any legacy aliases that map to the same wire name (e.g. caller asked
  // for ConnectivitySMILES, row only has CanonicalSMILES; or caller asked for
  // CanonicalSMILES, row only has CanonicalSMILES).
  const fallbacks = REVERSE_ALIASES[wire] ?? [];
  for (const legacy of fallbacks) {
    if (legacy in row && row[legacy] !== undefined && row[legacy] !== null) {
      return row[legacy];
    }
  }
  return undefined;
}

/**
 * Default property set returned by `get_compound` and `resolve_compound`.
 *
 * Keeps the legacy SMILES names so that the normalized DTO's `canonicalSmiles`
 * and `isomericSmiles` semantics remain stable for downstream callers (the
 * `normalize` mapper reads via `readPropertyValue`, which handles the alias
 * translation transparently).
 */
export const DEFAULT_PROPERTIES: SupportedProperty[] = [
  'MolecularFormula',
  'MolecularWeight',
  'CanonicalSMILES',
  'IsomericSMILES',
  'InChI',
  'InChIKey',
  'IUPACName',
  'XLogP',
  'TPSA',
  'Complexity',
  'Charge',
  'HBondDonorCount',
  'HBondAcceptorCount',
  'RotatableBondCount',
  'HeavyAtomCount',
];

export const COMPACT_PROPERTIES: SupportedProperty[] = [
  'MolecularFormula',
  'MolecularWeight',
  'CanonicalSMILES',
  'InChIKey',
  'IUPACName',
];

export function isSupportedProperty(name: string): name is SupportedProperty {
  return SUPPORTED_SET.has(name);
}

/**
 * Validate a requested property list. Returns the unique, ordered list of
 * names as the caller wrote them (no alias translation here — that happens
 * separately via `propertiesForPubChem()` so that response rows can still be
 * keyed by the originally-requested name).
 *
 * Throws `PubChemValidationError` on any unsupported value.
 */
export function validateProperties(requested: ReadonlyArray<string>): SupportedProperty[] {
  const seen = new Set<string>();
  const result: SupportedProperty[] = [];
  const invalid: string[] = [];
  for (const name of requested) {
    if (typeof name !== 'string' || name.length === 0) {
      invalid.push(String(name));
      continue;
    }
    if (!isSupportedProperty(name)) {
      invalid.push(name);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  if (invalid.length > 0) {
    throw new PubChemValidationError(
      `Unsupported property name(s): ${invalid.join(', ')}. Supported names: ${SUPPORTED_PROPERTIES.join(
        ', ',
      )}`,
      { endpoint: 'compound/cid/property' },
    );
  }
  return result;
}
