import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompoundService } from '../services/compoundService.js';
import { PropertyService } from '../services/propertyService.js';
import { SynonymService } from '../services/synonymService.js';
import { AssayService } from '../services/assayService.js';
import { AnnotationService } from '../services/annotationService.js';
import { PubChemError } from '../pubchem/pubchemErrors.js';
import type { ServiceContext } from '../services/serviceContext.js';

function parsePositiveInt(value: string | string[] | undefined, label: string): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new Error(`Missing ${label}`);
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${label}: ${raw}`);
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${label}: ${raw}`);
  return n;
}

function jsonContents(uri: URL, payload: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorContents(uri: URL, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const body: Record<string, unknown> = { error: message };
  if (err instanceof PubChemError) {
    body.category = err.category;
    body.retryable = err.retryable;
    if (err.endpoint) body.endpoint = err.endpoint;
  }
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}

export function registerResources(server: McpServer, ctx: ServiceContext): void {
  const compound = new CompoundService(ctx);
  const property = new PropertyService(ctx);
  const synonym = new SynonymService(ctx);
  const assay = new AssayService(ctx);
  const annotation = new AnnotationService(ctx);

  server.registerResource(
    'pubchem-compound',
    new ResourceTemplate('pubchem://compound/{cid}', { list: undefined }),
    {
      title: 'PubChem Compound',
      description: 'Normalized compound summary by CID.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const cid = parsePositiveInt(vars.cid, 'cid');
        const result = await compound.getCompound({ cid });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );

  server.registerResource(
    'pubchem-compound-properties',
    new ResourceTemplate('pubchem://compound/{cid}/properties', { list: undefined }),
    {
      title: 'PubChem Compound Properties',
      description: 'Default computed property set for a CID.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const cid = parsePositiveInt(vars.cid, 'cid');
        const result = await property.getProperties({ cids: [cid] });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );

  server.registerResource(
    'pubchem-compound-synonyms',
    new ResourceTemplate('pubchem://compound/{cid}/synonyms', { list: undefined }),
    {
      title: 'PubChem Compound Synonyms',
      description: 'Up to 50 synonyms for a CID.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const cid = parsePositiveInt(vars.cid, 'cid');
        const result = await synonym.getSynonyms({ cid });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );

  server.registerResource(
    'pubchem-compound-structure',
    new ResourceTemplate('pubchem://compound/{cid}/structure', { list: undefined }),
    {
      title: 'PubChem Compound Structure',
      description: 'Full PUG-REST JSON structure record for a CID.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const cid = parsePositiveInt(vars.cid, 'cid');
        const result = await compound.getStructure({ cid, format: 'json' });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );

  server.registerResource(
    'pubchem-compound-annotations',
    new ResourceTemplate('pubchem://compound/{cid}/annotations', { list: undefined }),
    {
      title: 'PubChem Compound Annotations',
      description: 'PUG-View annotation sections for a CID (up to 20 by default).',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const cid = parsePositiveInt(vars.cid, 'cid');
        const result = await annotation.getAnnotations({ cid });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );

  server.registerResource(
    'pubchem-assay',
    new ResourceTemplate('pubchem://assay/{aid}', { list: undefined }),
    {
      title: 'PubChem Bioassay',
      description: 'Normalized bioassay summary by AID.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      try {
        const aid = parsePositiveInt(vars.aid, 'aid');
        const result = await assay.getAssay({ aid });
        return jsonContents(uri, result);
      } catch (err) {
        return errorContents(uri, err);
      }
    },
  );
}
