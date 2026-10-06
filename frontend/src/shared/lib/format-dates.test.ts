import { describe, expect, it } from 'vitest';

import {
  DIAS_DE_LA_SEMANA,
  diaCorto,
  diaLargo,
  MESES_CORTOS,
  MESES_LARGOS,
  mesCorto,
  mesLargo,
  rangoLargo,
} from './format';

/**
 * The names now come from `Intl` (es-CO) instead of four hand-written lists.
 * These are the lists and the shapes the screens printed before (step 7.3):
 * if a browser's `Intl` ever says it differently, this is where it shows.
 */
describe('dates, written the way Coco writes them', () => {
  it('names the months and the weekdays as the hand-written lists did', () => {
    expect(MESES_LARGOS.join(' ')).toBe(
      'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre',
    );
    expect(MESES_CORTOS.join(' ')).toBe('ene feb mar abr may jun jul ago sep oct nov dic');
    expect(DIAS_DE_LA_SEMANA.join(' ')).toBe('lu ma mi ju vi sá do');
  });

  it('writes a day long and short', () => {
    expect(diaLargo('2026-09-06')).toBe('6 de septiembre de 2026');
    expect(diaCorto('2026-03-06')).toBe('6 mar 2026');
  });

  it('writes a month long and short', () => {
    expect(mesLargo('2026-09')).toBe('Septiembre de 2026');
    expect(mesLargo('2026-09-01')).toBe('Septiembre de 2026');
    expect(mesCorto('2026-03-01')).toBe('mar 2026');
  });

  it('writes a range without repeating what both ends share', () => {
    expect(rangoLargo('2026-09-06', '2026-09-15')).toBe('6 — 15 de septiembre de 2026');
    expect(rangoLargo('2026-08-06', '2026-09-15')).toBe('6 de agosto — 15 de septiembre de 2026');
    expect(rangoLargo('2025-12-06', '2026-01-15')).toBe(
      '6 de diciembre de 2025 — 15 de enero de 2026',
    );
  });

  it('gives back what it cannot read instead of throwing', () => {
    expect(diaLargo('no-es-fecha')).toBe('no-es-fecha');
    expect(mesLargo('2026-13')).toBe('2026-13');
  });
});
