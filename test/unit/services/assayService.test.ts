import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AssayService } from '../../../src/services/assayService.js';
import {
  installMswLifecycle,
  makeServiceContext,
  setupServer,
  TEST_BASE,
} from '../../helpers/serviceContext.js';
import { PubChemNotFoundError } from '../../../src/pubchem/pubchemErrors.js';

const server = setupServer();
installMswLifecycle(server);

describe('AssayService.getAssay', () => {
  it('normalizes assay summaries', async () => {
    server.use(
      http.get(`${TEST_BASE}/assay/aid/1259357/summary/JSON`, () =>
        HttpResponse.json({
          AssaySummaries: {
            AssaySummary: [
              {
                AID: 1259357,
                Name: 'Cytotoxicity test',
                Description: ['Line 1', 'Line 2'],
                ActiveCount: 12,
                InactiveCount: 5,
                SourceName: 'NCI',
              },
            ],
          },
        }),
      ),
    );
    const svc = new AssayService(makeServiceContext());
    const r = await svc.getAssay({ aid: 1259357 });
    expect(r.name).toBe('Cytotoxicity test');
    expect(r.description).toContain('Line 1');
    expect(r.activityOutcomeCounts?.active).toBe(12);
    expect(r.pubchemUrl).toContain('/bioassay/1259357');
  });

  it('throws PubChemNotFoundError when missing', async () => {
    server.use(
      http.get(`${TEST_BASE}/assay/aid/999/summary/JSON`, () =>
        HttpResponse.json({ AssaySummaries: { AssaySummary: [] } }),
      ),
    );
    const svc = new AssayService(makeServiceContext());
    await expect(svc.getAssay({ aid: 999 })).rejects.toBeInstanceOf(PubChemNotFoundError);
  });
});

describe('AssayService.getCompoundAssays', () => {
  it('returns and truncates AIDs', async () => {
    const aids = Array.from({ length: 300 }, (_, i) => i + 1);
    server.use(
      http.get(`${TEST_BASE}/compound/cid/2244/aids/JSON`, () =>
        HttpResponse.json({ InformationList: { Information: [{ CID: 2244, AID: aids }] } }),
      ),
    );
    const svc = new AssayService(makeServiceContext());
    const r = await svc.getCompoundAssays({ cid: 2244, limit: 50 });
    expect(r.aids).toHaveLength(50);
    expect(r.truncated).toBe(true);
  });
});
