import { PubChemNotFoundError } from '../pubchem/pubchemErrors.js';
import type {
  AnnotationReference,
  AnnotationSection,
  CompoundAnnotationsResult,
} from '../pubchem/pubchemTypes.js';
import { buildPugViewCompoundUrl } from '../pubchem/pubchemUrls.js';
import { nowIso, type ServiceContext, urlConfig } from './serviceContext.js';

interface RawReference {
  ReferenceNumber?: number;
  SourceName?: string;
  SourceID?: string;
  Description?: string;
  URL?: string;
}

interface RawValue {
  StringWithMarkup?: Array<{ String?: string }>;
  Number?: number[];
  Boolean?: boolean[];
  Unit?: string;
}

interface RawInformation {
  ReferenceNumber?: number;
  Reference?: string[];
  Description?: string;
  Value?: RawValue;
  Name?: string;
}

interface RawSection {
  TOCHeading?: string;
  Description?: string;
  Section?: RawSection[];
  Information?: RawInformation[];
}

interface RawRecord {
  Record?: {
    RecordTitle?: string;
    Section?: RawSection[];
    Reference?: RawReference[];
  };
}

export interface GetAnnotationsInput {
  cid: number;
  heading?: string;
  maxSections?: number;
}

export class AnnotationService {
  constructor(private readonly ctx: ServiceContext) {}

  async getAnnotations(input: GetAnnotationsInput): Promise<CompoundAnnotationsResult> {
    const cid = input.cid;
    const heading = input.heading?.trim();
    const maxSections = clamp(input.maxSections ?? 20, 1, 100);

    const url = buildPugViewCompoundUrl(urlConfig(this.ctx.config), cid, heading);
    const raw = await this.ctx.view.getJson<RawRecord>(url);
    if (!raw.Record) {
      throw new PubChemNotFoundError(`No PUG-View record for CID ${cid}`, {
        endpoint: 'data/compound',
      });
    }

    const referenceLookup = new Map<number, AnnotationReference>();
    for (const ref of raw.Record.Reference ?? []) {
      if (ref.ReferenceNumber === undefined) continue;
      referenceLookup.set(ref.ReferenceNumber, {
        refNumber: ref.ReferenceNumber,
        ...(ref.SourceName ? { sourceName: ref.SourceName } : {}),
        ...(ref.URL ? { sourceUrl: ref.URL } : {}),
        ...(ref.Description ? { description: ref.Description } : {}),
      });
    }

    const allSections: AnnotationSection[] = [];
    const visit = (section: RawSection, breadcrumb: string[]) => {
      const path =
        section.TOCHeading !== undefined ? [...breadcrumb, section.TOCHeading] : breadcrumb;
      const matchesHeading =
        !heading ||
        path.some((p) => p.toLowerCase().includes(heading.toLowerCase()));
      const information = section.Information ?? [];
      if (matchesHeading && information.length > 0) {
        const texts: string[] = [];
        const refs: AnnotationReference[] = [];
        for (const info of information) {
          if (info.Description) texts.push(info.Description);
          const swm = info.Value?.StringWithMarkup ?? [];
          for (const node of swm) {
            if (node.String) texts.push(node.String);
          }
          if (info.Value?.Number) {
            for (const n of info.Value.Number) {
              texts.push(`${n}${info.Value.Unit ? ` ${info.Value.Unit}` : ''}`);
            }
          }
          if (info.ReferenceNumber !== undefined) {
            const r = referenceLookup.get(info.ReferenceNumber);
            if (r) refs.push(r);
          }
        }
        if (texts.length > 0) {
          allSections.push({
            heading: section.TOCHeading ?? 'Untitled section',
            breadcrumb: path,
            ...(section.Description ? { description: section.Description } : {}),
            texts,
            references: dedupeRefs(refs),
          });
        }
      }
      for (const child of section.Section ?? []) {
        visit(child, path);
      }
    };

    for (const top of raw.Record.Section ?? []) {
      visit(top, []);
    }

    const totalSections = allSections.length;
    const truncated = totalSections > maxSections;
    const sections = truncated ? allSections.slice(0, maxSections) : allSections;

    if (totalSections === 0) {
      throw new PubChemNotFoundError(
        heading
          ? `No PUG-View sections matched heading "${heading}" for CID ${cid}`
          : `PUG-View record for CID ${cid} contained no annotation sections`,
        { endpoint: 'data/compound' },
      );
    }

    return {
      cid,
      ...(raw.Record.RecordTitle ? { recordTitle: raw.Record.RecordTitle } : {}),
      sections,
      totalSections,
      truncated,
      _meta: {
        source: 'PubChem',
        backend: 'PUG-View',
        retrievedAt: nowIso(),
        query: { cid, heading, maxSections },
        ...(truncated
          ? { warnings: [`Result truncated to ${maxSections} of ${totalSections} sections`] }
          : {}),
      },
    };
  }
}

function dedupeRefs(refs: AnnotationReference[]): AnnotationReference[] {
  const out: AnnotationReference[] = [];
  const seen = new Set<number>();
  for (const r of refs) {
    if (r.refNumber === undefined) continue;
    if (seen.has(r.refNumber)) continue;
    seen.add(r.refNumber);
    out.push(r);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
