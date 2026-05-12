import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { PropertyService } from '../../../src/services/propertyService.js';
import {
  installMswLifecycle,
  makeServiceContext,
  setupServer,
  TEST_BASE,
} from '../../helpers/serviceContext.js';

const server = setupServer();
installMswLifecycle(server);

describe('PropertyService', () => {
  it('returns rows for the default property set', async () => {
    server.use(
      http.get(`${TEST_BASE}/compound/cid/2244,962/property/*`, () =>
        HttpResponse.json({
          PropertyTable: {
            Properties: [
              { CID: 2244, MolecularFormula: 'C9H8O4', MolecularWeight: 180.16 },
              { CID: 962, MolecularFormula: 'H2O', MolecularWeight: 18.015 },
            ],
          },
        }),
      ),
    );
    const svc = new PropertyService(makeServiceContext());
    const r = await svc.getProperties({ cids: [2244, 962] });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.properties.MolecularFormula).toBe('C9H8O4');
    expect(r.properties).toContain('XLogP');
  });

  it('honours an explicit property allowlist', async () => {
    server.use(
      http.get(`${TEST_BASE}/compound/cid/2244/property/*`, () =>
        HttpResponse.json({
          PropertyTable: { Properties: [{ CID: 2244, MolecularFormula: 'C9H8O4', XLogP: 1.2 }] },
        }),
      ),
    );
    const svc = new PropertyService(makeServiceContext());
    const r = await svc.getProperties({ cids: [2244], properties: ['MolecularFormula', 'XLogP'] });
    expect(r.properties).toEqual(['MolecularFormula', 'XLogP']);
    expect(Object.keys(r.rows[0]!.properties)).toEqual(['MolecularFormula', 'XLogP']);
  });

  it('rejects unknown property names', async () => {
    const svc = new PropertyService(makeServiceContext());
    await expect(svc.getProperties({ cids: [2244], properties: ['LethalDose'] })).rejects.toThrow(
      /Unsupported property/,
    );
  });

  it('rejects an empty CID list', async () => {
    const svc = new PropertyService(makeServiceContext());
    await expect(svc.getProperties({ cids: [] })).rejects.toThrow();
  });
});
