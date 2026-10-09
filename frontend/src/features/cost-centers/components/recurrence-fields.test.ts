import { describe, expect, it } from 'vitest';

import { shortMonthNotice, whenItRecurs, clampDay } from './recurrence-fields';

describe('The payment day typed by hand', () => {
  it('lets any day of the month through', () => {
    expect(clampDay('15')).toBe(15);
    expect(clampDay('1')).toBe(1);
    expect(clampDay('31')).toBe(31);
  });

  it('clamps what goes over the top or under the bottom', () => {
    expect(clampDay('45')).toBe(31);
    expect(clampDay('0')).toBe(1);
    expect(clampDay('-3')).toBe(1);
  });

  it('an empty field is worth 1, it is not left blank', () => {
    // Without a value, the form is left in a state that cannot be saved and does not
    // say so.
    expect(clampDay('')).toBe(1);
    expect(clampDay('abc')).toBe(1);
  });
});

describe('The warning about short months', () => {
  it('up to the 28th there is nothing to warn about', () => {
    expect(shortMonthNotice(15)).toBe('');
    expect(shortMonthNotice(28)).toBe('');
  });

  it('the 29th only falls off in a non-leap February', () => {
    expect(shortMonthNotice(29)).toContain('bisiestos');
    expect(shortMonthNotice(29)).not.toContain('abril');
  });

  it('the 30th falls off in February, but not in the 30-day months', () => {
    expect(shortMonthNotice(30)).toContain('febrero');
    expect(shortMonthNotice(30)).not.toContain('abril');
  });

  it('the 31st also falls off in the 30-day months, and names them', () => {
    // "Se ajusta en los meses cortos" forces you to imagine which ones.
    const notice = shortMonthNotice(31);
    for (const month of ['febrero', 'abril', 'junio', 'septiembre', 'noviembre']) {
      expect(notice).toContain(month);
    }
  });
});

describe('When the payment comes back', () => {
  it('a monthly one does not need to say which month', () => {
    expect(whenItRecurs('monthly', 15, 3)).toBe('Todos los meses el día 15.');
  });

  it('a yearly one says the day and the month', () => {
    expect(whenItRecurs('annual', 20, 9)).toBe('Cada 20 de septiembre.');
  });

  it('a quarterly one NAMES the four months', () => {
    // "Cada tres meses" does not say which ones, and which ones is exactly what has to be
    // checkable before saving.
    expect(whenItRecurs('quarterly', 15, 3)).toBe(
      'El día 15 de marzo, junio, septiembre, diciembre.',
    );
  });

  it('two quarterly ones with different months give different lists', () => {
    expect(whenItRecurs('quarterly', 1, 1)).toContain('enero');
    expect(whenItRecurs('quarterly', 1, 2)).toContain('febrero');
    expect(whenItRecurs('quarterly', 1, 1)).not.toContain('febrero');
  });

  it('a semiannual one names the two', () => {
    expect(whenItRecurs('semiannual', 10, 2)).toBe('El día 10 de febrero, agosto.');
  });

  it('a bimonthly one names the six', () => {
    expect(whenItRecurs('bimonthly', 5, 1).split(',').length).toBe(6);
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
    expect(whenItRecurs(periodicity, 31, month)).toBe(expected);
  });
});
