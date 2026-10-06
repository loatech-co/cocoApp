import { afterEach, describe, expect, it, vi } from 'vitest';

import { rangeOf } from './filters';

/**
 * Los rangos se calculan en America/Bogota (UTC−5). Se fija el reloj para que
 * las pruebas no cambien de resultado según el día en que se corran ni según la
 * zona horaria de quien las corre.
 */
function freeze(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => vi.useRealTimers());

describe('Rangos de tiempo', () => {
  it('el mes en curso llega HASTA HOY, no hasta fin de mes', () => {
    freeze('2025-03-14T15:00:00Z');
    // Incluir días que no han ocurrido aplanaría cualquier promedio.
    expect(rangeOf('mes-actual')).toEqual({ from: '2025-03-01', to: '2025-03-14' });
  });

  it('el mes pasado es el mes anterior COMPLETO', () => {
    freeze('2025-03-14T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2025-02-01', to: '2025-02-28' });
  });

  it('el mes pasado respeta los años bisiestos', () => {
    freeze('2024-03-10T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('los últimos 3 meses cuentan hacia atrás desde hoy, no el trimestre calendario', () => {
    freeze('2025-04-02T15:00:00Z');
    // El 2 de abril uno quiere ver desde febrero, no solo los dos días de abril.
    expect(rangeOf('trimestre')).toEqual({ from: '2025-02-01', to: '2025-04-02' });
  });

  it('el año en curso va del 1 de enero a hoy', () => {
    freeze('2025-07-09T15:00:00Z');
    expect(rangeOf('anio-actual')).toEqual({ from: '2025-01-01', to: '2025-07-09' });
  });

  it('el año pasado es el año anterior completo', () => {
    freeze('2025-07-09T15:00:00Z');
    expect(rangeOf('anio-pasado')).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });

  it('cruza bien el fin de año hacia atrás', () => {
    freeze('2025-01-15T15:00:00Z');
    expect(rangeOf('mes-pasado')).toEqual({ from: '2024-12-01', to: '2024-12-31' });
    expect(rangeOf('trimestre')).toEqual({ from: '2024-11-01', to: '2025-01-15' });
  });

  it('a primera hora del día en Bogotá sigue siendo el día anterior en UTC', () => {
    // 03:00 UTC del 15 son las 22:00 del 14 en Bogotá: el rango tiene que
    // terminar el 14, o la app mostraría un día que allá no ha empezado.
    freeze('2025-03-15T03:00:00Z');
    expect(rangeOf('mes-actual').to).toBe('2025-03-14');
  });
});
