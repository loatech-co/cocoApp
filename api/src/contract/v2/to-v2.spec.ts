import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FIELD_NAMES, toV2 } from './to-v2';
import { defined } from './v1-input';

describe('toV2', () => {
  it('renames the Spanish fields, re-cases the rest and leaves camelCase alone', () => {
    expect(
      toV2({ id: 1n, por_revisar: true, created_at: 'x', parentId: 2n, sort_order: 3 }),
    ).toEqual({ id: 1n, needsReview: true, createdAt: 'x', parentId: 2n, sortOrder: 3 });
  });

  it('translates the literals of the fields that carry them, and only those', () => {
    expect(
      toV2({
        clasificacion: { certeza: 'alta', fuente: 'palabras-clave', motivo: 'Por el comercio.' },
        periodicidad: 'bimestral',
        breakdown_level: 'centro de costos',
        source: 'ios_manual',
      }),
    ).toEqual({
      classification: { certainty: 'high', source: 'keywords', reason: 'Por el comercio.' },
      periodicity: 'bimonthly',
      breakdownLevel: 'cost_center',
      source: 'ios_manual',
    });
  });

  it('walks arrays and nested objects, and keeps dates, nulls and bigints', () => {
    const date = new Date('2026-10-05T00:00:00Z');
    expect(
      toV2({ data: [{ nombre_archivo: 'a.pdf', captured_at: date, account_id: null }] }),
    ).toEqual({ data: [{ fileName: 'a.pdf', capturedAt: date, accountId: null }] });
  });

  it('copies the audit log changes as they were recorded', () => {
    const changes = { por_revisar: true, periodicidad: 'mensual' };
    expect(toV2({ entity_id: 1, changes })).toEqual({ entityId: 1, changes });
  });

  it('drops only the undefined keys, so null still means "clear it"', () => {
    expect(defined({ a: undefined, b: null, c: 0 })).toEqual({ b: null, c: 0 });
  });

  it('uses the names of the rename map (docs/standards/rename-map.json)', () => {
    const map = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'docs/standards/rename-map.json'),
        'utf8',
      ),
    ) as { jsonFields: { from: string; to: string }[] };
    const mapped = new Map(map.jsonFields.map(({ from, to }) => [from, to]));

    for (const [from, to] of Object.entries(FIELD_NAMES)) {
      expect({ from, to: mapped.get(from) }).toEqual({ from, to });
    }
  });
});
