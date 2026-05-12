import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getAssayShape,
  getCompoundAnnotationsShape,
  getCompoundAssaysShape,
  getCompoundPropertiesShape,
  getCompoundShape,
  getCompoundStructureShape,
  getCompoundSynonymsShape,
  getServerStatusShape,
  resolveCompoundShape,
  searchStructureShape,
} from '../schemas/toolSchemas.js';
import type { ServiceContext } from '../services/serviceContext.js';
import { CompoundService } from '../services/compoundService.js';
import { PropertyService } from '../services/propertyService.js';
import { SynonymService } from '../services/synonymService.js';
import { StructureSearchService } from '../services/structureSearchService.js';
import { AssayService } from '../services/assayService.js';
import { AnnotationService } from '../services/annotationService.js';
import { PubChemError } from '../pubchem/pubchemErrors.js';
import type { ServerStatus } from '../pubchem/pubchemTypes.js';
import type { TtlCache } from '../infrastructure/cache.js';
import type { ThrottleStateTracker } from '../infrastructure/throttling.js';
import type { CachedEntry } from '../pubchem/pugRestClient.js';

export interface ToolRegistrationDeps {
  ctx: ServiceContext;
  cache: TtlCache<CachedEntry>;
  throttle: ThrottleStateTracker;
  startedAt: number;
  packageVersion: string;
}

interface ToolOk {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}
interface ToolErr {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

function ok(payload: unknown): ToolOk {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string, hint?: { retryable?: boolean; endpoint?: string; category?: string }): ToolErr {
  const body: Record<string, unknown> = { error: message };
  if (hint) Object.assign(body, hint);
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    isError: true,
  };
}

function toErrorResponse(err: unknown): ToolErr {
  if (err instanceof PubChemError) {
    return fail(err.message, {
      category: err.category,
      retryable: err.retryable,
      ...(err.endpoint ? { endpoint: err.endpoint } : {}),
    });
  }
  if (err instanceof Error) {
    return fail(err.message);
  }
  return fail('Unknown error');
}

export function registerTools(server: McpServer, deps: ToolRegistrationDeps): void {
  const { ctx } = deps;
  const compound = new CompoundService(ctx);
  const property = new PropertyService(ctx);
  const synonym = new SynonymService(ctx);
  const structureSearch = new StructureSearchService(ctx);
  const assay = new AssayService(ctx);
  const annotation = new AnnotationService(ctx);

  server.registerTool(
    'resolve_compound',
    {
      title: 'Resolve compound identifier to CIDs',
      description:
        'Resolve a free-form compound identifier (name, CID, SMILES, InChI, InChIKey, formula) to one or more PubChem Compound IDs (CIDs). Optionally enriches each candidate with a compact set of computed properties.',
      inputSchema: resolveCompoundShape,
    },
    async (args) => {
      try {
        const result = await compound.resolveCompound(args);
        return ok(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound',
    {
      title: 'Get compound by CID',
      description: 'Retrieve a normalized compound summary by PubChem CID using PUG-REST property endpoints.',
      inputSchema: getCompoundShape,
    },
    async (args) => {
      try {
        return ok(await compound.getCompound(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound_properties',
    {
      title: 'Get computed compound properties',
      description:
        'Retrieve selected computed PubChem properties for up to 100 CIDs in a single request. Property names are validated against an allowlist that matches PubChem`s documented property table.',
      inputSchema: getCompoundPropertiesShape,
    },
    async (args) => {
      try {
        return ok(await property.getProperties(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound_synonyms',
    {
      title: 'Get compound synonyms',
      description: 'Retrieve up to 500 synonyms for a compound from PubChem PUG-REST.',
      inputSchema: getCompoundSynonymsShape,
    },
    async (args) => {
      try {
        return ok(await synonym.getSynonyms(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound_structure',
    {
      title: 'Get compound structure',
      description:
        'Retrieve a compound`s structure as SMILES, InChI, InChIKey, SDF, or full JSON record. SDF responses are truncated above 256KB and a `truncated` flag is set.',
      inputSchema: getCompoundStructureShape,
    },
    async (args) => {
      try {
        return ok(await compound.getStructure(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'search_structure',
    {
      title: 'Search compounds by structure',
      description:
        'Run an identity / similarity / substructure / superstructure search against PubChem. Synchronous (`fast*`) endpoints are preferred; asynchronous searches are polled via the ListKey mechanism. Returns CIDs plus a compact property set per hit.',
      inputSchema: searchStructureShape,
    },
    async (args) => {
      try {
        return ok(await structureSearch.search(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_assay',
    {
      title: 'Get bioassay summary',
      description: 'Retrieve a normalized assay summary by AID using PUG-REST.',
      inputSchema: getAssayShape,
    },
    async (args) => {
      try {
        return ok(await assay.getAssay(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound_assays',
    {
      title: 'List bioassays for a compound',
      description:
        'Retrieve AIDs of PubChem bioassays associated with a CID. If the endpoint is not supported, an explicit unsupported-operation error is returned rather than fabricated data.',
      inputSchema: getCompoundAssaysShape,
    },
    async (args) => {
      try {
        return ok(await assay.getCompoundAssays(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_compound_annotations',
    {
      title: 'Get compound annotations from PUG-View',
      description:
        'Retrieve curated annotation sections (pharmacology, hazards, literature, patents, etc.) from PubChem`s PUG-View. Each section carries provenance from PubChem`s reference list. This tool returns PubChem-sourced annotation text, not model predictions.',
      inputSchema: getCompoundAnnotationsShape,
    },
    async (args) => {
      try {
        return ok(await annotation.getAnnotations(args));
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  );

  server.registerTool(
    'get_server_status',
    {
      title: 'Get server diagnostic status',
      description:
        'Return diagnostic information about the running server: version, PubChem base URLs, configured rate limits, cache statistics, transport, uptime, and the most recent PubChem throttle state.',
      inputSchema: getServerStatusShape,
    },
    async () => {
      const cacheStats = deps.cache.stats();
      const throttle = deps.throttle.snapshot();
      const status: ServerStatus = {
        name: 'pubchem-mcp',
        version: deps.packageVersion,
        uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
        transport: 'stdio',
        pubchemBaseUrl: ctx.config.baseUrl,
        pubchemViewBaseUrl: ctx.config.viewBaseUrl,
        limits: {
          rps: ctx.config.rps,
          rpm: ctx.config.rpm,
          timeoutMs: ctx.config.timeoutMs,
          maxRetries: ctx.config.maxRetries,
        },
        cache: {
          enabled: !cacheStats.disabled,
          ttlMs: cacheStats.ttlMs,
          maxEntries: cacheStats.maxEntries,
          size: cacheStats.size,
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          evictions: cacheStats.evictions,
        },
        throttle: {
          status: throttle.state?.worstStatus ?? 'unknown',
          ...(throttle.state?.requestCountPercent !== undefined
            ? { requestCountPercent: throttle.state.requestCountPercent }
            : {}),
          ...(throttle.state?.requestTimePercent !== undefined
            ? { requestTimePercent: throttle.state.requestTimePercent }
            : {}),
          ...(throttle.state?.serviceStatusPercent !== undefined
            ? { serviceStatusPercent: throttle.state.serviceStatusPercent }
            : {}),
          ...(throttle.updatedAt !== undefined
            ? { updatedAt: new Date(throttle.updatedAt).toISOString() }
            : {}),
        },
      };
      return ok(status);
    },
  );
}
