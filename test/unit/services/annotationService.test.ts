import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AnnotationService } from '../../../src/services/annotationService.js';
import {
  installMswLifecycle,
  makeServiceContext,
  setupServer,
  TEST_VIEW,
} from '../../helpers/serviceContext.js';
import { PubChemNotFoundError } from '../../../src/pubchem/pubchemErrors.js';

const server = setupServer();
installMswLifecycle(server);

const recordFixture = {
  Record: {
    RecordTitle: 'Aspirin',
    Reference: [
      { ReferenceNumber: 1, SourceName: 'DrugBank', URL: 'https://example.com/dbX' },
    ],
    Section: [
      {
        TOCHeading: 'Pharmacology and Biochemistry',
        Description: 'Pharmacology section.',
        Section: [
          {
            TOCHeading: 'Mechanism of Action',
            Information: [
              {
                ReferenceNumber: 1,
                Value: { StringWithMarkup: [{ String: 'Inhibits cyclooxygenase.' }] },
              },
            ],
          },
        ],
      },
      {
        TOCHeading: 'Names and Identifiers',
        Section: [
          {
            TOCHeading: 'Synonyms',
            Information: [{ Value: { StringWithMarkup: [{ String: 'Acetylsalicylic acid' }] } }],
          },
        ],
      },
    ],
  },
};

describe('AnnotationService', () => {
  it('flattens sections and attaches references', async () => {
    server.use(
      http.get(`${TEST_VIEW}/data/compound/2244/JSON`, () => HttpResponse.json(recordFixture)),
    );
    const svc = new AnnotationService(makeServiceContext());
    const r = await svc.getAnnotations({ cid: 2244 });
    expect(r.recordTitle).toBe('Aspirin');
    expect(r.sections.length).toBeGreaterThan(0);
    const mechanism = r.sections.find((s) => s.heading === 'Mechanism of Action');
    expect(mechanism).toBeDefined();
    expect(mechanism!.texts[0]).toContain('cyclooxygenase');
    expect(mechanism!.references[0]!.sourceName).toBe('DrugBank');
  });

  it('filters by heading substring (case-insensitive)', async () => {
    server.use(
      http.get(`${TEST_VIEW}/data/compound/2244/JSON`, () => HttpResponse.json(recordFixture)),
    );
    const svc = new AnnotationService(makeServiceContext());
    const r = await svc.getAnnotations({ cid: 2244, heading: 'synonyms' });
    expect(r.sections.every((s) => s.breadcrumb.some((b) => b.toLowerCase().includes('synonyms')))).toBe(true);
  });

  it('throws when nothing matches', async () => {
    server.use(
      http.get(`${TEST_VIEW}/data/compound/2244/JSON`, () =>
        HttpResponse.json({ Record: { Section: [] } }),
      ),
    );
    const svc = new AnnotationService(makeServiceContext());
    await expect(svc.getAnnotations({ cid: 2244 })).rejects.toBeInstanceOf(PubChemNotFoundError);
  });
});
