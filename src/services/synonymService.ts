import { PubChemNotFoundError } from '../pubchem/pubchemErrors.js';
import type { SynonymResult } from '../pubchem/pubchemTypes.js';
import { buildCompoundSynonymsUrl } from '../pubchem/pubchemUrls.js';
import { nowIso, type ServiceContext, urlConfig } from './serviceContext.js';

interface RawSynonymsResponse {
  InformationList?: {
    Information?: Array<{ CID?: number; Synonym?: string[] }>;
  };
}

export interface GetSynonymsInput {
  cid: number;
  limit?: number;
}

export class SynonymService {
  constructor(private readonly ctx: ServiceContext) {}

  async getSynonyms(input: GetSynonymsInput): Promise<SynonymResult> {
    const cid = input.cid;
    const limit = clamp(input.limit ?? 50, 1, 500);
    const url = buildCompoundSynonymsUrl(urlConfig(this.ctx.config), cid);
    const raw = await this.ctx.rest.getJson<RawSynonymsResponse>(url);
    const info = raw.InformationList?.Information?.[0];
    if (!info || !info.Synonym || info.Synonym.length === 0) {
      throw new PubChemNotFoundError(`No synonyms available for CID ${cid}`, {
        endpoint: 'compound/cid/synonyms',
      });
    }
    const all = info.Synonym;
    const truncated = all.length > limit;
    return {
      cid,
      synonyms: truncated ? all.slice(0, limit) : all,
      truncated,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { cid, limit },
        ...(truncated ? { warnings: [`Result truncated to ${limit} of ${all.length} synonyms`] } : {}),
      },
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
