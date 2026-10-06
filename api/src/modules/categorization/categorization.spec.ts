import {
  MIN_CONFIDENCE,
  suggestCategory,
  significantTokens,
  type HistoryEntry,
  type CategoryRule,
  learnablePattern,
} from './categorization';

const DELIVERY = 10n;
const GROCERIES = 20n;
const TRANSPORT = 30n;

describe('Automatic categorization (T1)', () => {
  const noContext = { history: [], rules: [] };

  describe('when it does NOT suggest', () => {
    it.each<[string, string | null | undefined]>([
      ['vacía', ''],
      ['null', null],
      ['undefined', undefined],
    ])('returns null with a %s description', (_, description) => {
      expect(suggestCategory(description, noContext)).toBeNull();
    });

    it('returns null without history or rules', () => {
      expect(suggestCategory('Exito Poblado', noContext)).toBeNull();
    });

    it('returns null when the description is only noise', () => {
      expect(suggestCategory('REF 000123', { history: [], rules: RULES })).toBeNull();
    });

    it('stays quiet when the history is split and no category dominates', () => {
      // A wrong suggestion is worse than none: a wrong category that slips in
      // unnoticed pollutes the reports for months.
      const history: HistoryEntry[] = [
        { description: 'Rappi', categoryId: DELIVERY },
        { description: 'Rappi', categoryId: GROCERIES },
        { description: 'Rappi', categoryId: TRANSPORT },
      ];
      expect(suggestCategory('Rappi', { history, rules: [] })).toBeNull();
    });
  });

  describe('learns from the history', () => {
    const history: HistoryEntry[] = [
      { description: 'RAPPI*RESTAURANTE', categoryId: DELIVERY },
      { description: 'Rappi Comida', categoryId: DELIVERY },
      { description: 'rappi ref 998877', categoryId: DELIVERY },
    ];

    it('suggests what the person has been classifying', () => {
      const suggestion = suggestCategory('RAPPI Domicilio', { history, rules: [] });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY, reason: 'history' });
      expect(suggestion!.confidence).toBe(100);
    });

    it('ignores accents, case and reference noise when comparing', () => {
      expect(suggestCategory('compra rappi REF 12345', { history, rules: [] })).toMatchObject({
        categoryId: DELIVERY,
      });
    });

    it('the history BEATS the seeded rules', () => {
      // Lists age; the history reflects how THIS person organizes their
      // finances, not how I do.
      const rules: CategoryRule[] = [
        { pattern: 'rappi', categoryId: GROCERIES, priority: 0, isSeeded: true },
      ];
      expect(suggestCategory('Rappi', { history, rules })).toMatchObject({
        categoryId: DELIVERY,
        reason: 'history',
      });
    });

    it('suggests nothing if no past transaction shares words', () => {
      expect(suggestCategory('Terpel Calle 10', { history, rules: [] })).toBeNull();
    });

    it('the dominant category wins even with some noise', () => {
      const mixed: HistoryEntry[] = [...history, { description: 'Rappi', categoryId: GROCERIES }];
      const suggestion = suggestCategory('Rappi', { history: mixed, rules: [] });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY });
      expect(suggestion!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(suggestion!.confidence).toBeLessThan(100);
    });
  });

  describe('keyword rules', () => {
    it('suggests from a seeded rule, with moderate confidence', () => {
      const suggestion = suggestCategory('EXITO POBLADO', { history: [], rules: RULES });
      expect(suggestion).toMatchObject({ categoryId: GROCERIES, reason: 'seeded_rule' });
      // Moderate on purpose: a seeded rule is our guess.
      expect(suggestion!.confidence).toBe(60);
    });

    it('an own rule weighs more than a seeded one', () => {
      const rules: CategoryRule[] = [
        { pattern: 'exito', categoryId: GROCERIES, priority: 0, isSeeded: true },
        { pattern: 'exito', categoryId: DELIVERY, priority: 10 },
      ];
      const suggestion = suggestCategory('Exito Poblado', { history: [], rules });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY, reason: 'rule' });
      expect(suggestion!.confidence).toBe(85);
    });

    it('at equal priority the most specific pattern wins', () => {
      const rules: CategoryRule[] = [
        { pattern: 'juan', categoryId: GROCERIES, priority: 0 },
        { pattern: 'juan valdez', categoryId: DELIVERY, priority: 0 },
      ];
      expect(suggestCategory('Juan Valdez Cafe', { history: [], rules })).toMatchObject({
        categoryId: DELIVERY,
      });
    });

    it('ignores empty patterns without blowing up', () => {
      const rules: CategoryRule[] = [{ pattern: '', categoryId: GROCERIES, priority: 99 }];
      expect(suggestCategory('Lo que sea', { history: [], rules })).toBeNull();
    });
  });

  describe('tokensSignificativos', () => {
    it('drops words shorter than three letters', () => {
      expect([...significantTokens('d1 la 10 casa')]).toEqual(['casa']);
    });

    it('drops merchant stop words', () => {
      expect([...significantTokens('exito de la 80 sas colombia')]).toEqual(['exito']);
    });

    it('drops loose numbers, which are usually references', () => {
      expect([...significantTokens('terpel 998877')]).toEqual(['terpel']);
    });
  });
});

/** A subset of the seeded rules, for the tests. */
const RULES: CategoryRule[] = [
  { pattern: 'exito', categoryId: GROCERIES, priority: 0, isSeeded: true },
  { pattern: 'carulla', categoryId: GROCERIES, priority: 0, isSeeded: true },
  { pattern: 'rappi', categoryId: DELIVERY, priority: 0, isSeeded: true },
  { pattern: 'uber', categoryId: TRANSPORT, priority: 0, isSeeded: true },
];

/**
 * What is learned from and what is not. "Do not learn from empty or generic
 * descriptions" is what keeps a rule "pago → Mercado" from turning every
 * "pago de" that comes later into groceries.
 */
describe('The pattern it learns with', () => {
  const normal = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  it('is the longest token that is not a number', () => {
    expect(learnablePattern('RAPPI*RESTAURANTE EL SITIO 2025', normal)).toBe('restaurante');
  });

  it('nothing comes out of an empty description', () => {
    expect(learnablePattern('', normal)).toBeNull();
    expect(learnablePattern(null, normal)).toBeNull();
    expect(learnablePattern('   ', normal)).toBeNull();
  });

  it('nor out of a generic one', () => {
    expect(learnablePattern('Pago', normal)).toBeNull();
    expect(learnablePattern('pago factura servicios', normal)).toBeNull();
    expect(learnablePattern('Transferencia 12345', normal)).toBeNull();
  });

  it('but a generic word does not hide the one that does say something', () => {
    expect(learnablePattern('Pago Netflix', normal)).toBe('netflix');
    expect(learnablePattern('compra en Carulla', normal)).toBe('carulla');
  });

  it('and words shorter than four letters do not count', () => {
    expect(learnablePattern('D1 ARA', normal)).toBeNull();
  });
});
