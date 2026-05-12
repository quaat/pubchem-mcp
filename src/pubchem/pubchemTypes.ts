/**
 * Normalized DTOs returned from the service layer. These are stable and
 * decoupled from PubChem's raw response shapes.
 */

export type PubChemBackend = 'PUG-REST' | 'PUG-View';

export interface ResultMetadata {
  source: 'PubChem';
  backend: PubChemBackend;
  retrievedAt: string;
  query?: unknown;
  warnings?: string[];
}

export interface NormalizedCompound {
  cid: number;
  name?: string;
  iupacName?: string;
  molecularFormula?: string;
  molecularWeight?: number;
  canonicalSmiles?: string;
  isomericSmiles?: string;
  inchi?: string;
  inchiKey?: string;
  xlogp?: number;
  tpsa?: number;
  complexity?: number;
  charge?: number;
  hBondDonorCount?: number;
  hBondAcceptorCount?: number;
  rotatableBondCount?: number;
  heavyAtomCount?: number;
  pubchemUrl: string;
}

export interface CompoundCandidate extends NormalizedCompound {
  /** Title/best name reported by PubChem when available. */
  title?: string;
}

export interface ResolveCompoundResult {
  query: string;
  identifierType: ResolveIdentifierType;
  candidates: CompoundCandidate[];
  _meta: ResultMetadata;
}

export type ResolveIdentifierType =
  | 'name'
  | 'cid'
  | 'smiles'
  | 'inchi'
  | 'inchikey'
  | 'formula';

export interface PropertyRow {
  cid: number;
  pubchemUrl: string;
  properties: Record<string, string | number | undefined>;
}

export interface PropertyResult {
  cids: number[];
  properties: string[];
  rows: PropertyRow[];
  _meta: ResultMetadata;
}

export interface SynonymResult {
  cid: number;
  synonyms: string[];
  truncated: boolean;
  _meta: ResultMetadata;
}

export interface StructurePayload {
  cid: number;
  format: 'smiles' | 'inchi' | 'inchikey' | 'sdf' | 'json';
  recordType?: '2d' | '3d';
  content: string;
  contentType: string;
  truncated?: boolean;
  _meta: ResultMetadata;
}

export interface StructureSearchHit {
  cid: number;
  pubchemUrl: string;
  molecularFormula?: string;
  molecularWeight?: number;
  canonicalSmiles?: string;
  inchiKey?: string;
}

export interface StructureSearchResult {
  query: string;
  queryType: 'smiles' | 'inchi';
  searchType: 'identity' | 'similarity_2d' | 'substructure' | 'superstructure';
  threshold?: number;
  totalHits: number;
  hits: StructureSearchHit[];
  listKey?: string;
  _meta: ResultMetadata;
}

export interface AssaySummary {
  aid: number;
  name?: string;
  description?: string;
  protocol?: string;
  comment?: string;
  source?: string;
  activityOutcomeCounts?: {
    active?: number;
    inactive?: number;
    inconclusive?: number;
    unspecified?: number;
    probe?: number;
    total?: number;
  };
  pubchemUrl: string;
  raw?: unknown;
  _meta: ResultMetadata;
}

export interface CompoundAssaysResult {
  cid: number;
  aids: number[];
  truncated: boolean;
  _meta: ResultMetadata;
}

export interface AnnotationSection {
  heading: string;
  breadcrumb: string[];
  description?: string;
  texts: string[];
  references: AnnotationReference[];
}

export interface AnnotationReference {
  refNumber?: number;
  sourceName?: string;
  sourceUrl?: string;
  description?: string;
}

export interface CompoundAnnotationsResult {
  cid: number;
  recordTitle?: string;
  sections: AnnotationSection[];
  totalSections: number;
  truncated: boolean;
  _meta: ResultMetadata;
}

export interface ServerStatus {
  name: string;
  version: string;
  uptimeSeconds: number;
  transport: 'stdio';
  pubchemBaseUrl: string;
  pubchemViewBaseUrl: string;
  limits: {
    rps: number;
    rpm: number;
    timeoutMs: number;
    maxRetries: number;
  };
  cache: {
    enabled: boolean;
    ttlMs: number;
    maxEntries: number;
    size: number;
    hits: number;
    misses: number;
    evictions: number;
  };
  throttle: {
    status: string;
    requestCountPercent?: number;
    requestTimePercent?: number;
    serviceStatusPercent?: number;
    updatedAt?: string;
  };
}
