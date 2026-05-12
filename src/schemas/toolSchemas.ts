import { z } from 'zod';

const positiveCid = z
  .number()
  .int('CID must be an integer')
  .positive('CID must be a positive integer');

const positiveAid = z
  .number()
  .int('AID must be an integer')
  .positive('AID must be a positive integer');

export const resolveCompoundShape = {
  query: z.string().min(1, 'query must be non-empty').describe('Compound identifier (name, CID, SMILES, InChI, InChIKey, or formula).'),
  identifierType: z
    .enum(['name', 'cid', 'smiles', 'inchi', 'inchikey', 'formula', 'auto'])
    .optional()
    .describe("Identifier type. Default 'auto' detects from the query string."),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum candidates to return (1-100, default 10).'),
  includeProperties: z.boolean().optional().describe('Enrich candidates with compact properties (default true).'),
};

export const getCompoundShape = {
  cid: positiveCid.describe('PubChem Compound ID.'),
  includeRaw: z.boolean().optional().describe('Include raw PubChem response if under 64KB (default false).'),
};

export const getCompoundPropertiesShape = {
  cids: z.array(positiveCid).min(1).max(100).describe('CIDs to retrieve properties for (1-100).'),
  properties: z
    .array(z.string().min(1))
    .max(50)
    .optional()
    .describe('Specific PubChem property names. Defaults to the standard property set.'),
  includePubChemUrls: z.boolean().optional().describe('Include pubchem.ncbi.nlm.nih.gov URLs (default true).'),
};

export const getCompoundSynonymsShape = {
  cid: positiveCid.describe('PubChem Compound ID.'),
  limit: z.number().int().min(1).max(500).optional().describe('Max synonyms to return (1-500, default 50).'),
};

export const getCompoundStructureShape = {
  cid: positiveCid.describe('PubChem Compound ID.'),
  format: z
    .enum(['smiles', 'inchi', 'inchikey', 'sdf', 'json'])
    .optional()
    .describe("Structure format (default 'smiles')."),
  recordType: z.enum(['2d', '3d']).optional().describe('Record type for SDF (2D or 3D).'),
};

export const searchStructureShape = {
  query: z.string().min(1).describe('SMILES or InChI query string.'),
  queryType: z.enum(['smiles', 'inchi']).describe('Type of the query string.'),
  searchType: z
    .enum(['identity', 'similarity_2d', 'substructure', 'superstructure'])
    .describe('Structure search algorithm.'),
  threshold: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Similarity threshold 0-100 (only for similarity_2d, default 90).'),
  limit: z.number().int().min(1).max(100).optional().describe('Max hits to return (1-100, default 25).'),
};

export const getAssayShape = {
  aid: positiveAid.describe('PubChem Bioassay ID.'),
  includeRaw: z.boolean().optional().describe('Include raw PubChem response if under 64KB (default false).'),
};

export const getCompoundAssaysShape = {
  cid: positiveCid.describe('PubChem Compound ID.'),
  limit: z.number().int().min(1).max(200).optional().describe('Max AIDs to return (1-200, default 50).'),
};

export const getCompoundAnnotationsShape = {
  cid: positiveCid.describe('PubChem Compound ID.'),
  heading: z.string().min(1).optional().describe('Filter to sections whose TOC heading contains this substring (case-insensitive).'),
  maxSections: z.number().int().min(1).max(100).optional().describe('Max annotation sections to return (1-100, default 20).'),
};

export const getServerStatusShape = {};
