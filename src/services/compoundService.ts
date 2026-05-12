import { detectIdentifierType } from '../utils/ids.js';
import {
  buildCompoundByCidPropertyUrl,
  buildCompoundByFormulaCidsUrl,
  buildCompoundByInchiCidsUrl,
  buildCompoundByInchiKeyCidsUrl,
  buildCompoundByNameCidsUrl,
  buildCompoundBySmilesCidsUrl,
  buildCompoundFullRecordUrl,
  buildCompoundSdfUrl,
  publicCompoundUrl,
} from '../pubchem/pubchemUrls.js';
import {
  COMPACT_PROPERTIES,
  DEFAULT_PROPERTIES,
  type SupportedProperty,
} from '../pubchem/propertyRegistry.js';
import { normalizePropertyTable, type RawPropertyTable } from '../utils/normalize.js';
import type {
  CompoundCandidate,
  NormalizedCompound,
  ResolveCompoundResult,
  ResolveIdentifierType,
  StructurePayload,
} from '../pubchem/pubchemTypes.js';
import { PubChemNotFoundError } from '../pubchem/pubchemErrors.js';
import { nowIso, type ServiceContext, urlConfig } from './serviceContext.js';

interface CidListResponse {
  IdentifierList?: { CID?: number[] };
}

const SDF_MAX_BYTES = 256 * 1024;

export interface ResolveCompoundInput {
  query: string;
  identifierType?: ResolveIdentifierType | 'auto';
  limit?: number;
  includeProperties?: boolean;
}

export interface GetCompoundInput {
  cid: number;
  includeRaw?: boolean;
}

export interface GetStructureInput {
  cid: number;
  format?: 'smiles' | 'inchi' | 'inchikey' | 'sdf' | 'json';
  recordType?: '2d' | '3d';
}

const FORMAT_TO_PROPERTY: Record<'smiles' | 'inchi' | 'inchikey', SupportedProperty> = {
  smiles: 'CanonicalSMILES',
  inchi: 'InChI',
  inchikey: 'InChIKey',
};

export class CompoundService {
  constructor(private readonly ctx: ServiceContext) {}

  async resolveCompound(input: ResolveCompoundInput): Promise<ResolveCompoundResult> {
    const query = input.query.trim();
    if (!query) throw new Error('query must be non-empty');
    const limit = clamp(input.limit ?? 10, 1, 100);
    const includeProps = input.includeProperties ?? true;

    const requestedType = input.identifierType ?? 'auto';
    const identifierType: ResolveIdentifierType =
      requestedType === 'auto' ? detectIdentifierType(query) : requestedType;

    const cids = await this.lookupCids(identifierType, query, limit);
    if (cids.length === 0) {
      throw new PubChemNotFoundError(`No CIDs matched query`, {
        endpoint: `compound/${identifierType}`,
      });
    }

    const limited = cids.slice(0, limit);
    const candidates: CompoundCandidate[] = includeProps
      ? await this.enrichCandidates(limited)
      : limited.map((cid) => ({ cid, pubchemUrl: publicCompoundUrl(cid) }));

    return {
      query,
      identifierType,
      candidates,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { query, identifierType, limit, includeProperties: includeProps },
      },
    };
  }

  async getCompound(input: GetCompoundInput): Promise<NormalizedCompound & { raw?: unknown; _meta: ResolveCompoundResult['_meta'] }> {
    const cid = input.cid;
    const url = buildCompoundByCidPropertyUrl(
      urlConfig(this.ctx.config),
      [cid],
      DEFAULT_PROPERTIES,
    );
    const raw = await this.ctx.rest.getJson<RawPropertyTable>(url);
    const [normalized] = normalizePropertyTable(raw);
    if (!normalized) {
      throw new PubChemNotFoundError(`No compound found for CID ${cid}`, {
        endpoint: 'compound/cid',
      });
    }
    const result: NormalizedCompound & { raw?: unknown; _meta: ResolveCompoundResult['_meta'] } = {
      ...normalized,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { cid },
      },
    };
    if (input.includeRaw) {
      const json = JSON.stringify(raw);
      if (json.length <= 64 * 1024) {
        result.raw = raw;
      } else {
        result._meta.warnings = [
          ...(result._meta.warnings ?? []),
          'Raw response omitted because it exceeded the 64KB inline limit.',
        ];
      }
    }
    return result;
  }

  async getStructure(input: GetStructureInput): Promise<StructurePayload> {
    const cid = input.cid;
    const format = input.format ?? 'smiles';

    if (format === 'sdf') {
      const url = buildCompoundSdfUrl(urlConfig(this.ctx.config), cid, input.recordType);
      const text = await this.ctx.rest.getText(url);
      const truncated = text.length > SDF_MAX_BYTES;
      return {
        cid,
        format: 'sdf',
        ...(input.recordType ? { recordType: input.recordType } : {}),
        content: truncated ? text.slice(0, SDF_MAX_BYTES) : text,
        contentType: 'chemical/x-mdl-sdfile',
        truncated,
        _meta: meta('PUG-REST', { cid, format: 'sdf', recordType: input.recordType }),
      };
    }

    if (format === 'json') {
      const url = buildCompoundFullRecordUrl(urlConfig(this.ctx.config), cid);
      const raw = await this.ctx.rest.getJson<unknown>(url);
      return {
        cid,
        format: 'json',
        content: JSON.stringify(raw),
        contentType: 'application/json',
        _meta: meta('PUG-REST', { cid, format: 'json' }),
      };
    }

    const propName = FORMAT_TO_PROPERTY[format];
    const url = buildCompoundByCidPropertyUrl(urlConfig(this.ctx.config), [cid], [propName]);
    const raw = await this.ctx.rest.getJson<RawPropertyTable>(url);
    const row = raw.PropertyTable?.Properties?.[0];
    const value = row ? (row[propName] as string | number | undefined) : undefined;
    if (value === undefined || value === null || value === '') {
      throw new PubChemNotFoundError(`No ${propName} available for CID ${cid}`, {
        endpoint: `compound/cid/property/${propName}`,
      });
    }
    return {
      cid,
      format,
      content: String(value),
      contentType: 'text/plain',
      _meta: meta('PUG-REST', { cid, format }),
    };
  }

  private async lookupCids(
    type: ResolveIdentifierType,
    query: string,
    limit: number,
  ): Promise<number[]> {
    const url = (() => {
      switch (type) {
        case 'cid':
          return undefined; // Direct CID; skip lookup.
        case 'name':
          return buildCompoundByNameCidsUrl(urlConfig(this.ctx.config), query);
        case 'smiles':
          return buildCompoundBySmilesCidsUrl(urlConfig(this.ctx.config), query);
        case 'inchi':
          return buildCompoundByInchiCidsUrl(urlConfig(this.ctx.config), query);
        case 'inchikey':
          return buildCompoundByInchiKeyCidsUrl(urlConfig(this.ctx.config), query);
        case 'formula':
          return buildCompoundByFormulaCidsUrl(urlConfig(this.ctx.config), query);
      }
    })();

    if (!url) {
      const numeric = Number.parseInt(query, 10);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error(`Invalid CID: ${query}`);
      }
      return [numeric];
    }

    let body: CidListResponse;
    try {
      body = await this.ctx.rest.getJson<CidListResponse>(url);
    } catch (err) {
      if (err instanceof PubChemNotFoundError) return [];
      throw err;
    }
    const cids = body.IdentifierList?.CID ?? [];
    return cids.slice(0, Math.max(limit * 2, limit));
  }

  private async enrichCandidates(cids: number[]): Promise<CompoundCandidate[]> {
    if (cids.length === 0) return [];
    const properties: SupportedProperty[] = [...COMPACT_PROPERTIES, 'IsomericSMILES', 'InChI', 'Title'];
    const url = buildCompoundByCidPropertyUrl(urlConfig(this.ctx.config), cids, properties);
    const raw = await this.ctx.rest.getJson<RawPropertyTable>(url);
    const normalized = normalizePropertyTable(raw);
    const byCid = new Map(normalized.map((c) => [c.cid, c]));
    return cids.map((cid) => {
      const n = byCid.get(cid);
      if (!n) return { cid, pubchemUrl: publicCompoundUrl(cid) };
      return { ...n, title: n.name };
    });
  }
}

function meta(backend: 'PUG-REST' | 'PUG-View', query: unknown) {
  return {
    source: 'PubChem' as const,
    backend,
    retrievedAt: nowIso(),
    query,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
