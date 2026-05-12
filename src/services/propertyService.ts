import type { PropertyResult } from '../pubchem/pubchemTypes.js';
import { buildCompoundByCidPropertyUrl } from '../pubchem/pubchemUrls.js';
import {
  DEFAULT_PROPERTIES,
  type SupportedProperty,
  validateProperties,
} from '../pubchem/propertyRegistry.js';
import { rowsForProperties, type RawPropertyTable } from '../utils/normalize.js';
import { nowIso, type ServiceContext, urlConfig } from './serviceContext.js';

export interface GetPropertiesInput {
  cids: number[];
  properties?: string[];
  includePubChemUrls?: boolean;
}

export class PropertyService {
  constructor(private readonly ctx: ServiceContext) {}

  async getProperties(input: GetPropertiesInput): Promise<PropertyResult> {
    const cids = uniquePositiveInts(input.cids);
    if (cids.length === 0) {
      throw new Error('At least one CID is required.');
    }
    const properties: SupportedProperty[] =
      input.properties && input.properties.length > 0
        ? validateProperties(input.properties)
        : DEFAULT_PROPERTIES;

    const url = buildCompoundByCidPropertyUrl(urlConfig(this.ctx.config), cids, properties);
    const raw = await this.ctx.rest.getJson<RawPropertyTable>(url);
    const rows = rowsForProperties(raw, properties);
    if (input.includePubChemUrls === false) {
      for (const r of rows) {
        // Caller opted out of public URLs; clear them but keep the field for shape stability.
        r.pubchemUrl = '';
      }
    }
    return {
      cids,
      properties,
      rows,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { cids, properties },
      },
    };
  }
}

export function uniquePositiveInts(values: ReadonlyArray<number>): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
