import type { ResolveIdentifierType } from '../pubchem/pubchemTypes.js';

const INCHI_PREFIX = /^InChI=/i;
const INCHI_KEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const ALL_DIGITS = /^\d{1,9}$/;
// Conservative molecular-formula matcher: element symbols (Aa or A) followed by
// optional counts. Requires at least one element. Rejects strings that contain
// parentheses, charges, or whitespace, which we'd prefer to send to /name lookup.
const FORMULA = /^(?:[A-Z][a-z]?\d*)+$/;
// SMILES character set per OpenSMILES spec (organic subset + brackets + bonds +
// branches + rings + stereo + percent ring closures). Must contain at least one
// non-letter SMILES-specific character OR an explicit bracketed atom to reduce
// false positives against plain words.
const SMILES_CHARS = /^[A-Za-z0-9@+\-\[\]()=#$:/\\.%*]+$/;
// SMILES-only signal: bracket atoms, branches, explicit bonds, stereo, ring
// closure on a lowercase aromatic atom (e.g. `c1...`). Uppercase letter + digit
// is *not* a signal because that's the universal molecular-formula shape.
const SMILES_HINTS = /[\[\]()=#$:/\\%*]|[bcnops]\d/;

/**
 * Heuristically classify a free-form chemistry identifier string.
 *
 * Priority order:
 *   1. `InChI=...` prefix → inchi
 *   2. 27-char dashed alphabetic → inchikey
 *   3. Pure digits (≤9) → cid
 *   4. Looks like a molecular formula AND not also a SMILES → formula
 *   5. Looks like a SMILES → smiles
 *   6. Default → name
 *
 * This is intentionally conservative: when in doubt we return 'name', which is
 * the most permissive PubChem endpoint.
 */
export function detectIdentifierType(input: string): ResolveIdentifierType {
  const trimmed = input.trim();
  if (!trimmed) return 'name';
  if (INCHI_PREFIX.test(trimmed)) return 'inchi';
  if (INCHI_KEY.test(trimmed)) return 'inchikey';
  if (ALL_DIGITS.test(trimmed)) return 'cid';
  // Formula must look formula-like AND not contain SMILES-only hints.
  if (FORMULA.test(trimmed) && !SMILES_HINTS.test(trimmed) && /\d/.test(trimmed)) return 'formula';
  if (SMILES_CHARS.test(trimmed) && SMILES_HINTS.test(trimmed)) return 'smiles';
  return 'name';
}

export function parseCid(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number.parseInt(value, 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new Error(`Invalid CID: ${String(value)}`);
}
