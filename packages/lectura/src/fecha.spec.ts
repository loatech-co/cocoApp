import { fechasDe, leerFecha } from './fecha';

describe('fechasDe', () => {
  it('reads ISO, day-month-year and month-in-words dates', () => {
    expect(fechasDe('2026-03-05')).toEqual(['2026-03-05']);
    expect(fechasDe('05/03/2026')).toEqual(['2026-03-05']);
    expect(fechasDe('5.3.26')).toEqual(['2026-03-05']);
    expect(fechasDe('5 de marzo de 2026')).toEqual(['2026-03-05']);
    expect(fechasDe('05-MAR-2026')).toEqual(['2026-03-05']);
    expect(fechasDe('12 sept 2026')).toEqual(['2026-09-12']);
  });

  it('drops impossible dates and keeps each date once', () => {
    expect(fechasDe('2026-13-01 32/01/2026 01/01/1999')).toEqual([]);
    expect(fechasDe('2026-03-05 y 05/03/2026')).toEqual(['2026-03-05']);
  });
});

describe('leerFecha', () => {
  const texto = 'Emitida 2026-02-27. Pagada 2026-03-02';

  it('prefers the first date inside the period', () => {
    expect(leerFecha(texto, '2026-03')).toEqual({ iso: '2026-03-02', enElPeriodo: true });
  });

  it('falls back to the first date when none is in the period', () => {
    expect(leerFecha(texto, '2026-05')).toEqual({ iso: '2026-02-27', enElPeriodo: false });
    expect(leerFecha(texto)).toEqual({ iso: '2026-02-27', enElPeriodo: false });
  });

  it('uses the middle of the period when the text has no date', () => {
    expect(leerFecha('sin fecha', '2026-03')).toEqual({ iso: '2026-03-15', enElPeriodo: false });
  });

  it('returns null with no date and no period', () => {
    expect(leerFecha('sin fecha')).toBeNull();
  });
});
