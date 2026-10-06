import {
  pendingOutcome,
  expectedForMonth,
  chargeFingerprint,
  isAutoChargeDue,
  estimateForMonth,
  absoluteMonth,
  previousMonths,
  isDueInMonth,
  dueDate,
} from './pending';
import { toMoney } from '../../common/money/money';

describe('Pagos pendientes', () => {
  describe('Si toca en el mes', () => {
    it('lo mensual toca todos los meses, sin referencia que valga', () => {
      expect(isDueInMonth('monthly', null, '2026-09-01')).toBe(true);
      expect(isDueInMonth('monthly', 3, '2026-09-01')).toBe(true);
    });

    it('lo trimestral cae en su mes y cada tres desde ahí', () => {
      // Con referencia en marzo, junio, septiembre, diciembre.
      for (const month of ['2026-03-01', '2026-06-01', '2026-09-01', '2026-12-01']) {
        expect(isDueInMonth('quarterly', 3, month)).toBe(true);
      }
      for (const month of ['2026-04-01', '2026-05-01', '2026-07-01']) {
        expect(isDueInMonth('quarterly', 3, month)).toBe(false);
      }
    });

    it('dos trimestrales con referencias distintas caen en meses distintos', () => {
      // Es justo lo que "cada tres meses" a secas no puede expresar.
      expect(isDueInMonth('quarterly', 1, '2026-04-01')).toBe(true);
      expect(isDueInMonth('quarterly', 2, '2026-04-01')).toBe(false);
    });

    it('lo anual cae solo en su mes', () => {
      expect(isDueInMonth('annual', 9, '2026-09-01')).toBe(true);
      expect(isDueInMonth('annual', 9, '2027-09-01')).toBe(true);
      expect(isDueInMonth('annual', 9, '2026-03-01')).toBe(false);
    });

    it('lo semestral, dos veces al año', () => {
      expect(isDueInMonth('semiannual', 2, '2026-02-01')).toBe(true);
      expect(isDueInMonth('semiannual', 2, '2026-08-01')).toBe(true);
      expect(isDueInMonth('semiannual', 2, '2026-05-01')).toBe(false);
    });

    it('funciona hacia ATRÁS del mes de referencia', () => {
      // El ciclo no empieza a existir el día que se configuró: febrero de 2020
      // también era un mes par si la referencia es febrero.
      expect(isDueInMonth('bimonthly', 2, '2020-02-01')).toBe(true);
      expect(isDueInMonth('bimonthly', 2, '2020-03-01')).toBe(false);
    });

    it('sin referencia se asume que toca', () => {
      // Alguien lo marcó como recurrente y no hay registro: callarlo sería
      // esconder justo lo que se quiere ver.
      expect(isDueInMonth('annual', null, '2026-09-01')).toBe(true);
    });
  });

  describe('El día del vencimiento', () => {
    it('es el día de pago del concepto', () => {
      expect(dueDate('2026-09-01', 15)).toBe('2026-09-15');
    });

    it('en los meses cortos se recorta al último día', () => {
      // Quien paga el 31 no deja de pagar en febrero: paga el 28.
      expect(dueDate('2026-02-01', 31)).toBe('2026-02-28');
      expect(dueDate('2024-02-01', 31)).toBe('2024-02-29');
      expect(dueDate('2026-04-01', 31)).toBe('2026-04-30');
    });

    it('sin día declarado, vence el último del mes', () => {
      expect(dueDate('2026-09-01', null)).toBe('2026-09-30');
    });
  });

  describe('Meses absolutos', () => {
    it('la resta entre dos meses da los meses que pasaron', () => {
      expect(absoluteMonth('2026-01-01') - absoluteMonth('2025-11-01')).toBe(2);
    });
  });

  describe('Lo que se espera que cueste', () => {
    /** Los meses de `porMes`, ya en Money. */
    const history = (months: Record<string, string>): Map<string, ReturnType<typeof toMoney>> =>
      new Map(Object.entries(months).map(([m, v]) => [m, toMoney(v)]));

    it('los tres meses anteriores van del más reciente al más viejo', () => {
      expect(previousMonths('2026-09')).toEqual(['2026-08', '2026-07', '2026-06']);
      // Y cruzando el año, sin pelear con diciembre.
      expect(previousMonths('2026-02')).toEqual(['2026-01', '2025-12', '2025-11']);
    });

    it('promedia los tres meses anteriores', () => {
      const byMonth = history({ '2026-06': '90000', '2026-07': '100000', '2026-08': '110000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('un mes sin pago NO cuenta como cero', () => {
      // Dos de los tres meses. Con el cero saldrían 66.666: la mitad de lo que
      // de verdad cuesta cuando toca.
      const byMonth = history({ '2026-07': '100000', '2026-08': '100000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('100000.00');
    });

    it('con un solo mes, ese mes es la previsión', () => {
      expect(estimateForMonth(history({ '2026-08': '150000' }), '2026-09')?.toFixed(2)).toBe(
        '150000.00',
      );
    });

    it('un mes con dos pagos ya viene sumado, y cuenta como UN mes', () => {
      // 300.000 en agosto y 100.000 en julio: el promedio de dos meses es
      // 200.000, no el de los tres recibos.
      const byMonth = history({ '2026-07': '100000', '2026-08': '300000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('200000.00');
    });

    it('sin nada en los tres meses, se cae al último mes con pago', () => {
      // El caso de lo ANUAL: nunca hay pagos en los tres meses anteriores.
      const byMonth = history({ '2025-09': '700000', '2024-09': '600000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('700000.00');
    });

    it('sin historia no hay previsión', () => {
      expect(estimateForMonth(new Map(), '2026-09')).toBeNull();
    });

    it('lo que venga DESPUÉS del mes estimado no cuenta', () => {
      // Puede pasar con un periodo futuro cargado a mano.
      const byMonth = history({ '2026-10': '999999', '2025-09': '700000' });
      expect(estimateForMonth(byMonth, '2026-09')?.toFixed(2)).toBe('700000.00');
    });
  });
});

/**
 * El presupuesto del concepto, cuando lo tiene.
 *
 * Hay gastos cuyo valor se SABE —un alquiler con contrato, una mensualidad—
 * y para esos el promedio de los tres meses anteriores es peor que el dato:
 * lo arrastra el mes que se pagó con recargo y cambia solo de un mes a otro
 * sin que nadie haya tocado nada.
 */
describe('Lo que se espera que cueste', () => {
  const history = new Map([
    ['2026-08', toMoney('100000')],
    ['2026-07', toMoney('140000')],
    ['2026-06', toMoney('120000')],
  ]);

  it('con presupuesto, ese número y no el promedio', () => {
    // El promedio de esos tres meses es 120.000; el presupuesto gana.
    expect(expectedForMonth(toMoney('180000'), history, '2026-09')?.toString()).toBe('180000');
  });

  it('el mismo mes tras mes, aunque la historia cambie', () => {
    // Es la definición de tenerlo: un presupuesto que se moviera con lo que
    // costó antes no sería un presupuesto, sería una influencia.
    const other = new Map([['2026-08', toMoney('900000')]]);
    expect(expectedForMonth(toMoney('180000'), other, '2026-09')?.toString()).toBe('180000');
  });

  it('sin presupuesto, el promedio de siempre', () => {
    expect(expectedForMonth(null, history, '2026-09')?.toString()).toBe(
      estimateForMonth(history, '2026-09')?.toString(),
    );
  });

  it('un presupuesto de CERO es un presupuesto, no un hueco', () => {
    // Quien escribe 0 está diciendo «esto este año no cuesta». Caer al
    // promedio le devolvería justo la cifra que quiso quitar.
    expect(expectedForMonth(toMoney('0'), history, '2026-09')?.toString()).toBe('0');
  });

  it('sin presupuesto y sin historia, no hay cifra que dar', () => {
    expect(expectedForMonth(null, new Map(), '2026-09')).toBeNull();
  });
});

/**
 * El cobro automático.
 *
 * Un concepto marcado así no espera a que nadie lo registre: cuando llega su
 * día, el movimiento se crea solo. Lo que decide esta función es CUÁNDO, y
 * equivocarse escribe plata que no salió.
 */
describe('Cobrar solo', () => {
  const base = {
    isAutoPaid: true,
    dueDateIso: '2026-09-20',
    todayIso: '2026-09-25',
    expected: toMoney('180000'),
  };

  it('cobra cuando ya venció', () => {
    expect(isAutoChargeDue(base)).toBe(true);
    // El mismo día cuenta: vence hoy, sale hoy.
    expect(isAutoChargeDue({ ...base, todayIso: '2026-09-20' })).toBe(true);
  });

  it('NO se adelanta al vencimiento', () => {
    // Un débito del día 20 no ha salido el día 3. Anotarlo antes es decir que
    // la plata ya se fue cuando sigue ahí.
    expect(isAutoChargeDue({ ...base, todayIso: '2026-09-03' })).toBe(false);
  });

  it('no toca nada si el concepto no lo pidió', () => {
    // Quien no lo enciende quiere registrar a mano.
    expect(isAutoChargeDue({ ...base, isAutoPaid: false })).toBe(false);
  });

  it('sin cifra no inventa una', () => {
    // Sin presupuesto y sin historia no hay número que poner, y un cobro de
    // cero sería una mentira escrita en la contabilidad. Se queda pendiente.
    expect(isAutoChargeDue({ ...base, expected: null })).toBe(false);
  });

  it('la huella identifica un concepto y un mes, y nada más', () => {
    expect(chargeFingerprint(100n, '2026-09')).toBe('auto:100:2026-09');
    // Da igual cómo llegue el mes: lo que cuenta es el año y el mes.
    expect(chargeFingerprint(100n, '2026-09-20')).toBe('auto:100:2026-09');
    expect(chargeFingerprint(100n, '2026-10')).not.toBe(chargeFingerprint(100n, '2026-09'));
    expect(chargeFingerprint(101n, '2026-09')).not.toBe(chargeFingerprint(100n, '2026-09'));
  });
});

/**
 * Un concepto que se paga en varias veces.
 *
 * El caso real: «Mercado», 1.200.000 al mes, que se hace en cuatro idas. Antes
 * la primera ida lo sacaba de pagos pendientes y el resto del mes la lista
 * decía que no faltaba nada.
 */
describe('Lo que se cubre a pedazos', () => {
  const expected = toMoney('1200000');
  const marked = (paid: string) =>
    pendingOutcome({
      isMultiPayment: true,
      hasPayment: paid !== '0',
      paid: toMoney(paid),
      expected,
    });

  it('sigue faltando mientras lo pagado no alcance lo esperado', () => {
    expect(marked('0').isStillDue).toBe(true);
    expect(marked('320450').isStillDue).toBe(true);
    expect(marked('1199999.99').isStillDue).toBe(true);
  });

  it('deja de faltar al alcanzarlo, no al pasarlo', () => {
    // Exactamente igual YA está cubierto: pedir un peso más seria pedir algo
    // que nadie debe.
    expect(marked('1200000').isStillDue).toBe(false);
    expect(marked('1350000').isStillDue).toBe(false);
  });

  it('mientras se cubre, el mes cuenta lo ESPERADO y no lo pagado', () => {
    // «¿Cuánta plata tengo que tener este mes?» se responde con el total, no
    // con el anticipo. Contar lo pagado haría que el presupuesto del mes
    // creciera con cada ida al mercado.
    expect(marked('0').towardBudget.toString()).toBe('1200000');
    expect(marked('320450').towardBudget.toString()).toBe('1200000');
  });

  it('y cuando se pasa, cuenta lo PAGADO, que ya es un hecho', () => {
    expect(marked('1350000').towardBudget.toString()).toBe('1350000');
  });

  it('sin una cifra a la que llegar se comporta como siempre', () => {
    // Si no, sería un pendiente que no se puede saldar nunca: ruido
    // permanente en la única lista que dice qué falta.
    const noFigure = pendingOutcome({
      isMultiPayment: true,
      hasPayment: true,
      paid: toMoney('50000'),
      expected: null,
    });
    expect(noFigure.isStillDue).toBe(false);
    expect(noFigure.towardBudget.toString()).toBe('50000');

    const zero = pendingOutcome({
      isMultiPayment: true,
      hasPayment: true,
      paid: toMoney('50000'),
      expected: toMoney('0'),
    });
    expect(zero.isStillDue).toBe(false);
  });
});

describe('Un concepto normal no cambia de comportamiento', () => {
  const normal = (hasPayment: boolean, paid: string, expected: string | null) =>
    pendingOutcome({
      isMultiPayment: false,
      hasPayment,
      paid: toMoney(paid),
      expected: expected === null ? null : toMoney(expected),
    });

  it('un solo movimiento confirmado lo saca de la lista, aunque sea menos', () => {
    // Es la regla de siempre y no se toca: el alquiler pagado a medias lo
    // resuelve quien lo pagó, no la lista.
    const r = normal(true, '300000', '1200000');
    expect(r.isStillDue).toBe(false);
    expect(r.towardBudget.toString()).toBe('300000');
  });

  it('sin pago, falta, y el mes cuenta lo esperado', () => {
    const r = normal(false, '0', '1200000');
    expect(r.isStillDue).toBe(true);
    expect(r.towardBudget.toString()).toBe('1200000');
  });

  it('un movimiento de CERO también lo saca', () => {
    // Se pregunta si el movimiento EXISTE, no si suma. Un cero es alguien
    // diciendo «esto este mes no costó», que es una respuesta.
    const r = normal(true, '0', '1200000');
    expect(r.isStillDue).toBe(false);
    expect(r.towardBudget.toString()).toBe('0');
  });

  it('sin pago y sin cifra, falta y no aporta nada al presupuesto', () => {
    const r = normal(false, '0', null);
    expect(r.isStillDue).toBe(true);
    expect(r.towardBudget.toString()).toBe('0');
  });
});
