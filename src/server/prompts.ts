import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'compound-research-brief',
    {
      title: 'Compound research brief',
      description:
        'Guide for producing a sourced research brief on a compound using only PubChem data, with explicit citations and limitations.',
      argsSchema: {
        compound: z.string().describe('Compound name or PubChem CID.'),
      },
    },
    ({ compound }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Research brief for: ${compound}`,
              '',
              'Use only the data returned by this MCP server (PubChem PUG-REST and PUG-View). Do not introduce information you cannot cite.',
              '',
              'Steps:',
              '1. Call `resolve_compound` with the query. Confirm the CID and identifier type.',
              '2. Call `get_compound_properties` with the resolved CID and the default property set.',
              '3. Call `get_compound_synonyms` (limit 25) to summarize common names.',
              '4. Call `get_compound_annotations` to retrieve PUG-View sections; if the brief is focused (e.g. pharmacology), pass an appropriate `heading` filter.',
              '',
              'When writing the brief:',
              '- Cite each fact as "PubChem CID <cid>" or by the `references[].sourceName` returned in annotations.',
              '- Distinguish computed properties (`PUG-REST`) from curated annotations (`PUG-View`).',
              '- Include a final "Limitations" section noting that this brief uses only PubChem data, is not medical/regulatory/laboratory-safety advice, and that critical decisions require verification with authoritative sources.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'compare-compounds',
    {
      title: 'Compare compounds',
      description:
        'Compare multiple compounds across a shared set of PubChem properties, rendering a markdown table and flagging missing data.',
      argsSchema: {
        compounds: z
          .string()
          .describe('Comma-separated list of compound names or CIDs (e.g. "aspirin, caffeine, 962").'),
      },
    },
    ({ compounds }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Compare these compounds: ${compounds}`,
              '',
              'Steps:',
              '1. Split the input into individual identifiers and call `resolve_compound` for each (include_properties=false) to get CIDs.',
              '2. Call `get_compound_properties` once with all resolved CIDs and the default property set.',
              '3. Render a markdown table with rows = compounds (use Title or first synonym) and columns = MolecularFormula, MolecularWeight, XLogP, TPSA, HBondDonorCount, HBondAcceptorCount, RotatableBondCount.',
              '4. Mark missing values as `N/A`. Do not estimate or interpolate.',
              '',
              'Close with one short paragraph of factual observations (e.g. "B has the highest molecular weight"). Do not infer pharmacology or safety from these properties alone.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'safety-annotation-review',
    {
      title: 'Safety annotation review',
      description:
        'Review PubChem PUG-View safety-related annotations for a compound, treating the returned text strictly as source data.',
      argsSchema: {
        compound: z.string().describe('Compound name or PubChem CID.'),
      },
    },
    ({ compound }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Safety annotation review for: ${compound}`,
              '',
              'Steps:',
              '1. Resolve the compound to a CID with `resolve_compound`.',
              '2. Call `get_compound_annotations` with `heading="Safety and Hazards"` (and again with `heading="Toxicity"` if the first yields nothing).',
              '3. For each returned section, output the heading breadcrumb, the verbatim text, and the source from `references[].sourceName`.',
              '',
              'Strict rules:',
              '- Present the annotation text as PubChem-sourced data, not as your own analysis or recommendation.',
              '- Do not extrapolate medical, regulatory, occupational, or laboratory-safety guidance beyond what PubChem returned.',
              '- If `get_compound_annotations` returns nothing for the requested headings, say so explicitly — do not invent content.',
              '- End with: "This summary reflects only PubChem source annotations as of the retrieval timestamp and is not a substitute for authoritative safety data sheets, regulatory filings, or expert advice."',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
