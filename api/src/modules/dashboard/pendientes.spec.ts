import { toMoney } from '../../common/money/money';
import { estimadoDelMes, mesAbsoluto, mesesAnteriores, tocaEnElMes, vencimiento } from './pendientes';

describe('Pagos pendientes', () => {
  describe('Si toca en el mes', () => {
    it('lo mensual toca todos los meses, sin referencia que valga', () => {
      expect(tocaEnElMes('mensual', null, '2026-09-01')).toBe(true);
      expect(tocaEnElMes('mensual', 3, '2026-09-01')).toBe(true);
    });

    it('lo trimestral cae en su mes y cada tres desde ahí', () => {
      // Con referencia en marzo: marzo, junio, septiembre, diciembre.
      for (const mes of ['2026-03-01', '2026-06-01', '2026-09-01', '2026-12-01']) {
        expect(tocaEnElMes('trimestral', 3, mes)).toBe(true);
      }
      for (const mes of ['2026-04-01', '2026-05-01', '2026-07-01']) {
        expect(tocaEnElMes('trimestral', 3, mes)).toBe(false);
      }
    });

    it('dos trimestrales con referencias distintas caen en meses distintos', () => {
      // Es justo lo que "cada tres meses" a secas no puede expresar.
      expect(tocaEnElMes('trimestral', 1, '2026-04-01')).toBe(true);
      expect(tocaEnElMes('trimestral', 2, '2026-04-01')).toBe(false);
    });

    it('lo anual cae solo en su mes', () => {
      expect(tocaEnElMes('anual', 9, '2026-09-01')).toBe(true);
      expect(tocaEnElMes('anual', 9, '2027-09-01')).toBe(true);
      expect(tocaEnElMes('anual', 9, '2026-03-01')).toBe(false);
    });

    it('lo semestral, dos veces al año', () => {
      expect(tocaEnElMes('semestral', 2, '2026-02-01')).toBe(true);
      expect(tocaEnElMes('semestral', 2, '2026-08-01')).toBe(true);
      expect(tocaEnElMes('semestral', 2, '2026-05-01')).toBe(false);
    });

    it('funciona hacia ATRÁS del mes de referencia', () => {
      // El ciclo no empieza a existir el día que se configuró: febrero de 2020
      // también era un mes par si la referencia es febrero.
      expect(tocaEnElMes('bimestral', 2, '2020-02-01')).toBe(true);
      expect(tocaEnElMes('bimestral', 2, '2020-03-01')).toBe(false);
    });

    it('sin referencia se asume que toca', () => {
      // Alguien lo marcó como recurrente y no hay registro: callarlo sería
      // esconder justo lo que se quiere ver.
      expect(tocaEnElMes('anual', null, '2026-09-01')).toBe(true);
    });
  });

  describe('El día del vencimiento', () => {
    it('es el día de pago del concepto', () => {
      expect(vencimiento('2026-09-01', 15)).toBe('2026-09-15');
    });

    it('en los meses cortos se recorta al último día', () => {
      // Quien paga el 31 no deja de pagar en febrero: paga el 28.
      expect(vencimiento('2026-02-01', 31)).toBe('2026-02-28');
      expect(vencimiento('2024-02-01', 31)).toBe('2024-02-29');
      expect(vencimiento('2026-04-01', 31)).toBe('2026-04-30');
    });

    it('sin día declarado, vence el último del mes', () => {
      expect(vencimiento('2026-09-01', null)).toBe('2026-09-30');
    });
  });

  describe('Meses absolutos', () => {
    it('la resta entre dos meses da los meses que pasaron', () => {
      expect(mesAbsoluto('2026-01-01') - mesAbsoluto('2025-11-01')).toBe(2);
    });
  });

  describe('Lo que se espera que cueste', () => {
    /** Los meses de `porMes`, ya en Money. */
    const historia = (meses: Record<string, string>): Map<string, ReturnType<typeof toMoney>> =>
      new Map(Object.entries(meses).map(([m, v]) => [m, toMoney(v)]));

    it('los tres meses anteriores van del más reciente al más viejo', () => {
      expect(mesesAnteriores('2026-09')).toEqual(['2026-08', '2026-07', '2026-06']);
      // Y cruzando el año, sin pelear con diciembre.
      expect(mesesAnteriores('2026-02')).toEqual(['2026-01', '2025-12', '2025-11']);
    });

    it('promedia los tres meses anteriores', () => {
      const porMes = historia({ '2026-06': '90000', '2026-07': '100000', '2026-08': '110000' });
      expect(estimadoDelMes(porMes, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('un mes sin pago NO cuenta como cero', () => {
      // Dos de los tres meses. Con el cero saldrían 66.666: la mitad de lo que
      // de verdad cuesta cuando toca.
      const porMes = historia({ '2026-07': '100000', '2026-08': '100000' });
      expect(estimadoDelMes(porMes, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('con un solo mes, ese mes es la previsión', () => {
      expect(estimadoDelMes(historia({ '2026-08': '150000' }), '2026-09')?.toFixed(2)).toBe(
        '150000.00',
      );
    });

    it('un mes con dos pagos ya viene sumado, y cuenta como UN mes', () => {
      // 300.000 en agosto y 100.000 en julio: el promedio de dos meses es
      // 200.000, no el de los tres recibos.
      const porMes = historia({ '2026-07': '100000', '2026-08': '300000' });
      expect(estimadoDelMes(porMes, '2026-09')?.toFixed(2)).toBe('200000.00');
    });

    it('sin nada en los tres meses, se cae al último mes con pago', () => {
      // El caso de lo ANUAL: nunca hay pagos en los tres meses anteriores.
      const porMes = historia({ '2025-09': '700000', '2024-09': '600000' });
      expect(estimadoDelMes(porMes, '2026-09')?.toFixed(2)).toBe('700000.00');
    });

    it('sin historia no hay previsión', () => {
      expect(estimadoDelMes(new Map(), '2026-09')).toBeNull();
    });

    it('lo que venga DESPUÉS del mes estimado no cuenta', () => {
      // Puede pasar con un periodo futuro cargado a mano.
      const porMes = historia({ '2026-10': '999999', '2025-09': '700000' });
      expect(estimadoDelMes(porMes, '2026-09')?.toFixed(2)).toBe('700000.00');
    });
  });
});
