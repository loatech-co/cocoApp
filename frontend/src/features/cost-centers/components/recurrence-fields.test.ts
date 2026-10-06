import { describe, expect, it } from 'vitest';

import { avisoDeMesCorto, cuandoVuelve, entre1y31 } from './recurrence-fields';

describe('El día de pago escrito a mano', () => {
  it('deja pasar cualquier día del mes', () => {
    expect(entre1y31('15')).toBe(15);
    expect(entre1y31('1')).toBe(1);
    expect(entre1y31('31')).toBe(31);
  });

  it('recorta lo que se pasa por arriba o por abajo', () => {
    expect(entre1y31('45')).toBe(31);
    expect(entre1y31('0')).toBe(1);
    expect(entre1y31('-3')).toBe(1);
  });

  it('un campo vacío vale 1, no queda en blanco', () => {
    // Sin valor, el formulario queda en un estado que no se puede guardar y no
    // lo dice.
    expect(entre1y31('')).toBe(1);
    expect(entre1y31('abc')).toBe(1);
  });
});

describe('El aviso de los meses cortos', () => {
  it('hasta el 28 no hay nada que avisar', () => {
    expect(avisoDeMesCorto(15)).toBe('');
    expect(avisoDeMesCorto(28)).toBe('');
  });

  it('el 29 solo se cae en febrero no bisiesto', () => {
    expect(avisoDeMesCorto(29)).toContain('bisiestos');
    expect(avisoDeMesCorto(29)).not.toContain('abril');
  });

  it('el 30 se cae en febrero, pero no en los meses de 30', () => {
    expect(avisoDeMesCorto(30)).toContain('febrero');
    expect(avisoDeMesCorto(30)).not.toContain('abril');
  });

  it('el 31 se cae también en los meses de 30, y los nombra', () => {
    // "Se ajusta en los meses cortos" obliga a imaginarse cuáles.
    const aviso = avisoDeMesCorto(31);
    for (const mes of ['febrero', 'abril', 'junio', 'septiembre', 'noviembre']) {
      expect(aviso).toContain(mes);
    }
  });
});

describe('Cuándo vuelve el pago', () => {
  it('lo mensual no necesita decir de qué mes', () => {
    expect(cuandoVuelve('monthly', 15, 3)).toBe('Todos los meses el día 15.');
  });

  it('lo anual dice el día y el mes', () => {
    expect(cuandoVuelve('annual', 20, 9)).toBe('Cada 20 de septiembre.');
  });

  it('lo trimestral NOMBRA los cuatro meses', () => {
    // "Cada tres meses" no dice cuáles, y cuáles es justo lo que hay que poder
    // comprobar antes de guardar.
    expect(cuandoVuelve('quarterly', 15, 3)).toBe(
      'El día 15 de marzo, junio, septiembre, diciembre.',
    );
  });

  it('dos trimestrales con meses distintos dan listas distintas', () => {
    expect(cuandoVuelve('quarterly', 1, 1)).toContain('enero');
    expect(cuandoVuelve('quarterly', 1, 2)).toContain('febrero');
    expect(cuandoVuelve('quarterly', 1, 1)).not.toContain('febrero');
  });

  it('lo semestral nombra los dos', () => {
    expect(cuandoVuelve('semiannual', 10, 2)).toBe('El día 10 de febrero, agosto.');
  });

  it('lo bimestral nombra los seis', () => {
    expect(cuandoVuelve('bimonthly', 5, 1).split(',').length).toBe(6);
  });
});

describe('Intermediate periodicities: the months the form names', () => {
  // These must be the same months the API treats as due
  // (api/src/modules/dashboard/intermediate-periodicities.spec.ts). A reference
  // month late in the year still lists the cycle from January.
  it.each([
    ['bimonthly', 12, 'El día 31 de febrero, abril, junio, agosto, octubre, diciembre.'],
    ['bimonthly', 11, 'El día 31 de enero, marzo, mayo, julio, septiembre, noviembre.'],
    ['quarterly', 12, 'El día 31 de marzo, junio, septiembre, diciembre.'],
    ['quarterly', 2, 'El día 31 de febrero, mayo, agosto, noviembre.'],
    ['semiannual', 8, 'El día 31 de febrero, agosto.'],
    ['semiannual', 12, 'El día 31 de junio, diciembre.'],
  ] as const)('%s with reference month %i', (periodicity, month, expected) => {
    expect(cuandoVuelve(periodicity, 31, month)).toBe(expected);
  });
});
