import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { SynonymService } from '../../../src/services/synonymService.js';
import {
  installMswLifecycle,
  makeServiceContext,
  setupServer,
  TEST_BASE,
} from '../../helpers/serviceContext.js';
import { PubChemNotFoundError } from '../../../src/pubchem/pubchemErrors.js';

const server = setupServer();
installMswLifecycle(server);

describe('SynonymService', () => {
  it('returns and truncates synonyms', async () => {
    const names = Array.from({ length: 120 }, (_, i) => `synonym-${i}`);
    server.use(
      http.get(`${TEST_BASE}/compound/cid/2244/synonyms/JSON`, () =>
        HttpResponse.json({ InformationList: { Information: [{ CID: 2244, Synonym: names }] } }),
      ),
    );
    const svc = new SynonymService(makeServiceContext());
    const r = await svc.getSynonyms({ cid: 2244, limit: 50 });
    expect(r.synonyms).toHaveLength(50);
    expect(r.truncated).toBe(true);
    expect(r._meta.warnings?.[0]).toMatch(/truncated/);
  });

  it('throws PubChemNotFoundError when none returned', async () => {
    server.use(
      http.get(`${TEST_BASE}/compound/cid/9999/synonyms/JSON`, () =>
        HttpResponse.json({ InformationList: { Information: [] } }),
      ),
    );
    const svc = new SynonymService(makeServiceContext());
    await expect(svc.getSynonyms({ cid: 9999 })).rejects.toBeInstanceOf(PubChemNotFoundError);
  });
});
