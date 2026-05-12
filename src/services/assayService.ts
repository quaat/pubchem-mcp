import {
  PubChemNotFoundError,
  PubChemUnsupportedOperationError,
} from '../pubchem/pubchemErrors.js';
import type { AssaySummary, CompoundAssaysResult } from '../pubchem/pubchemTypes.js';
import {
  buildAssaySummaryUrl,
  buildCompoundAidsUrl,
  publicAssayUrl,
} from '../pubchem/pubchemUrls.js';
import { nowIso, type ServiceContext, urlConfig } from './serviceContext.js';

interface RawAssaySummaryEntry {
  AID?: number;
  Name?: string;
  Description?: string[] | string;
  Protocol?: string[] | string;
  Comment?: string[] | string;
  SourceName?: string;
  ActiveCount?: number;
  InactiveCount?: number;
  InconclusiveCount?: number;
  UnspecifiedCount?: number;
  ProbeCount?: number;
  CIDCountAll?: number;
  TotalSidCount?: number;
}

interface RawAssaySummary {
  AssaySummaries?: { AssaySummary?: RawAssaySummaryEntry[] };
}

interface RawCompoundAidsResponse {
  InformationList?: {
    Information?: Array<{ CID?: number; AID?: number[] }>;
  };
}

export interface GetAssayInput {
  aid: number;
  includeRaw?: boolean;
}

export interface GetCompoundAssaysInput {
  cid: number;
  limit?: number;
}

export class AssayService {
  constructor(private readonly ctx: ServiceContext) {}

  async getAssay(input: GetAssayInput): Promise<AssaySummary> {
    const aid = input.aid;
    const url = buildAssaySummaryUrl(urlConfig(this.ctx.config), aid);
    const raw = await this.ctx.rest.getJson<RawAssaySummary>(url);
    const entry = raw.AssaySummaries?.AssaySummary?.[0];
    if (!entry) {
      throw new PubChemNotFoundError(`No assay summary available for AID ${aid}`, {
        endpoint: 'assay/aid/summary',
      });
    }
    const description = arrayOrStringToString(entry.Description);
    const protocol = arrayOrStringToString(entry.Protocol);
    const comment = arrayOrStringToString(entry.Comment);
    const summary: AssaySummary = {
      aid,
      pubchemUrl: publicAssayUrl(aid),
      ...(entry.Name ? { name: entry.Name } : {}),
      ...(description ? { description } : {}),
      ...(protocol ? { protocol } : {}),
      ...(comment ? { comment } : {}),
      ...(entry.SourceName ? { source: entry.SourceName } : {}),
      activityOutcomeCounts: {
        ...(entry.ActiveCount !== undefined ? { active: entry.ActiveCount } : {}),
        ...(entry.InactiveCount !== undefined ? { inactive: entry.InactiveCount } : {}),
        ...(entry.InconclusiveCount !== undefined ? { inconclusive: entry.InconclusiveCount } : {}),
        ...(entry.UnspecifiedCount !== undefined ? { unspecified: entry.UnspecifiedCount } : {}),
        ...(entry.ProbeCount !== undefined ? { probe: entry.ProbeCount } : {}),
        ...(entry.TotalSidCount !== undefined ? { total: entry.TotalSidCount } : {}),
      },
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { aid },
      },
    };
    if (input.includeRaw) {
      const json = JSON.stringify(raw);
      if (json.length <= 64 * 1024) {
        summary.raw = raw;
      } else {
        summary._meta.warnings = [
          ...(summary._meta.warnings ?? []),
          'Raw response omitted because it exceeded the 64KB inline limit.',
        ];
      }
    }
    return summary;
  }

  async getCompoundAssays(input: GetCompoundAssaysInput): Promise<CompoundAssaysResult> {
    const cid = input.cid;
    const limit = clamp(input.limit ?? 50, 1, 200);
    const url = buildCompoundAidsUrl(urlConfig(this.ctx.config), cid);
    let raw: RawCompoundAidsResponse;
    try {
      raw = await this.ctx.rest.getJson<RawCompoundAidsResponse>(url);
    } catch (err) {
      if (err instanceof PubChemUnsupportedOperationError) {
        throw err;
      }
      throw err;
    }
    const aids = raw.InformationList?.Information?.[0]?.AID ?? [];
    if (aids.length === 0) {
      throw new PubChemNotFoundError(`No bioassay associations for CID ${cid}`, {
        endpoint: 'compound/cid/aids',
      });
    }
    const truncated = aids.length > limit;
    return {
      cid,
      aids: truncated ? aids.slice(0, limit) : aids,
      truncated,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-REST',
        retrievedAt: nowIso(),
        query: { cid, limit },
        ...(truncated ? { warnings: [`Result truncated to ${limit} of ${aids.length} AIDs`] } : {}),
      },
    };
  }
}

function arrayOrStringToString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('\n');
  return undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
