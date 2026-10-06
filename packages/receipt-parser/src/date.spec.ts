import { datesIn, readDate } from './date';

describe('fechasDe', () => {
  it('reads ISO, day-month-year and month-in-words dates', () => {
    expect(datesIn('2026-03-05')).toEqual(['2026-03-05']);
    expect(datesIn('05/03/2026')).toEqual(['2026-03-05']);
    expect(datesIn('5.3.26')).toEqual(['2026-03-05']);
    expect(datesIn('5 de marzo de 2026')).toEqual(['2026-03-05']);
    expect(datesIn('05-MAR-2026')).toEqual(['2026-03-05']);
    expect(datesIn('12 sept 2026')).toEqual(['2026-09-12']);
  });

  it('drops impossible dates and keeps each date once', () => {
    expect(datesIn('2026-13-01 32/01/2026 01/01/1999')).toEqual([]);
    expect(datesIn('2026-03-05 y 05/03/2026')).toEqual(['2026-03-05']);
  });
});

describe('leerFecha', () => {
  const text = 'Emitida 2026-02-27. Pagada 2026-03-02';

  it('prefers the first date inside the period', () => {
    expect(readDate(text, '2026-03')).toEqual({ iso: '2026-03-02', inPeriod: true });
  });

  it('falls back to the first date when none is in the period', () => {
    expect(readDate(text, '2026-05')).toEqual({ iso: '2026-02-27', inPeriod: false });
    expect(readDate(text)).toEqual({ iso: '2026-02-27', inPeriod: false });
  });

  it('uses the middle of the period when the text has no date', () => {
    expect(readDate('sin fecha', '2026-03')).toEqual({ iso: '2026-03-15', inPeriod: false });
  });

  it('returns null with no date and no period', () => {
    expect(readDate('sin fecha')).toBeNull();
  });
});
