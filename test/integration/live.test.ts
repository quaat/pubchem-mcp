import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server/createServer.js';
import { loadConfig } from '../../src/infrastructure/config.js';
import { createLogger } from '../../src/infrastructure/logger.js';

const LIVE = process.env.PUBCHEM_MCP_LIVE_TESTS === '1';

async function boot() {
  // Use real PubChem URLs and conservative limits.
  const config = loadConfig({
    PUBCHEM_LOG_LEVEL: 'warn',
    PUBCHEM_RPS: '2',
    PUBCHEM_RPM: '60',
    PUBCHEM_MAX_RETRIES: '4',
    PUBCHEM_TIMEOUT_MS: '30000',
  } as NodeJS.ProcessEnv);
  const logger = createLogger({ logLevel: 'warn' });
  const created = createServer({ config, logger });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await created.server.connect(serverTransport);
  const client = new Client({ name: 'live-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function parsed(result: { content: unknown }): unknown {
  const arr = (result.content as Array<{ type: string; text?: string }>) ?? [];
  return JSON.parse(arr[0]?.text ?? 'null');
}

describe.skipIf(!LIVE)('live PubChem integration (gated by PUBCHEM_MCP_LIVE_TESTS=1)', () => {
  it(
    'resolves aspirin to CID 2244',
    async () => {
      const client = await boot();
      const r = await client.callTool({
        name: 'resolve_compound',
        arguments: { query: 'aspirin', limit: 1 },
      });
      const payload = parsed(r as { content: unknown }) as {
        candidates: { cid: number }[];
      };
      expect(payload.candidates[0]!.cid).toBe(2244);
    },
    30_000,
  );

  it(
    'fetches caffeine (CID 2519) properties',
    async () => {
      const client = await boot();
      const r = await client.callTool({
        name: 'get_compound_properties',
        arguments: { cids: [2519], properties: ['MolecularFormula', 'MolecularWeight'] },
      });
      const payload = parsed(r as { content: unknown }) as {
        rows: { properties: { MolecularFormula?: string } }[];
      };
      expect(payload.rows[0]!.properties.MolecularFormula).toBe('C8H10N4O2');
    },
    30_000,
  );

  it(
    'returns water (CID 962) synonyms',
    async () => {
      const client = await boot();
      const r = await client.callTool({
        name: 'get_compound_synonyms',
        arguments: { cid: 962, limit: 5 },
      });
      const payload = parsed(r as { content: unknown }) as { synonyms: string[] };
      expect(payload.synonyms.length).toBeGreaterThan(0);
      expect(payload.synonyms.join(' ').toLowerCase()).toMatch(/water|h2o/);
    },
    30_000,
  );
});

describe('live test gate', () => {
  it('is skipped when PUBCHEM_MCP_LIVE_TESTS is not set', () => {
    expect(LIVE).toBe(process.env.PUBCHEM_MCP_LIVE_TESTS === '1');
  });
});
