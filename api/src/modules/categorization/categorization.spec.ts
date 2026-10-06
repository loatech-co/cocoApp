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

describe('Categorización automática (T1)', () => {
  const noContext = { history: [], rules: [] };

  describe('cuándo NO sugiere', () => {
    it.each<[string, string | null | undefined]>([
      ['vacía', ''],
      ['null', null],
      ['undefined', undefined],
    ])('devuelve null con una descripción %s', (_, description) => {
      expect(suggestCategory(description, noContext)).toBeNull();
    });

    it('devuelve null sin historial ni reglas', () => {
      expect(suggestCategory('Exito Poblado', noContext)).toBeNull();
    });

    it('devuelve null cuando la descripción es solo ruido', () => {
      expect(suggestCategory('REF 000123', { history: [], rules: RULES })).toBeNull();
    });

    it('calla cuando el historial está repartido y ninguna categoría domina', () => {
      // Sugerir mal es peor que no sugerir: una categoría equivocada que se
      // cuela sin mirar contamina los informes durante meses.
      const history: HistoryEntry[] = [
        { description: 'Rappi', categoryId: DELIVERY },
        { description: 'Rappi', categoryId: GROCERIES },
        { description: 'Rappi', categoryId: TRANSPORT },
      ];
      expect(suggestCategory('Rappi', { history: history, rules: [] })).toBeNull();
    });
  });

  describe('aprende del historial', () => {
    const history: HistoryEntry[] = [
      { description: 'RAPPI*RESTAURANTE', categoryId: DELIVERY },
      { description: 'Rappi Comida', categoryId: DELIVERY },
      { description: 'rappi ref 998877', categoryId: DELIVERY },
    ];

    it('sugiere lo que la persona ya viene clasificando', () => {
      const suggestion = suggestCategory('RAPPI Domicilio', { history: history, rules: [] });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY, reason: 'history' });
      expect(suggestion!.confidence).toBe(100);
    });

    it('ignora tildes, mayúsculas y ruido de referencia al comparar', () => {
      expect(
        suggestCategory('compra rappi REF 12345', { history: history, rules: [] }),
      ).toMatchObject({
        categoryId: DELIVERY,
      });
    });

    it('el historial GANA a las reglas sembradas', () => {
      // Las listas envejecen; el historial refleja cómo organiza SUS finanzas
      // esta persona, no las mías.
      const rules: CategoryRule[] = [
        { pattern: 'rappi', categoryId: GROCERIES, priority: 0, isSeeded: true },
      ];
      expect(suggestCategory('Rappi', { history: history, rules: rules })).toMatchObject({
        categoryId: DELIVERY,
        reason: 'history',
      });
    });

    it('no sugiere nada si ningún antecedente comparte palabras', () => {
      expect(suggestCategory('Terpel Calle 10', { history: history, rules: [] })).toBeNull();
    });

    it('la categoría dominante gana aunque haya algo de ruido', () => {
      const mixed: HistoryEntry[] = [...history, { description: 'Rappi', categoryId: GROCERIES }];
      const suggestion = suggestCategory('Rappi', { history: mixed, rules: [] });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY });
      expect(suggestion!.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(suggestion!.confidence).toBeLessThan(100);
    });
  });

  describe('reglas por palabra clave', () => {
    it('sugiere desde una regla sembrada, con confianza moderada', () => {
      const suggestion = suggestCategory('EXITO POBLADO', { history: [], rules: RULES });
      expect(suggestion).toMatchObject({ categoryId: GROCERIES, reason: 'seeded_rule' });
      // Moderada a propósito: una regla sembrada es una suposición nuestra.
      expect(suggestion!.confidence).toBe(60);
    });

    it('una regla propia pesa más que una sembrada', () => {
      const rules: CategoryRule[] = [
        { pattern: 'exito', categoryId: GROCERIES, priority: 0, isSeeded: true },
        { pattern: 'exito', categoryId: DELIVERY, priority: 10 },
      ];
      const suggestion = suggestCategory('Exito Poblado', { history: [], rules: rules });
      expect(suggestion).toMatchObject({ categoryId: DELIVERY, reason: 'rule' });
      expect(suggestion!.confidence).toBe(85);
    });

    it('a igual prioridad gana el patrón más específico', () => {
      const rules: CategoryRule[] = [
        { pattern: 'juan', categoryId: GROCERIES, priority: 0 },
        { pattern: 'juan valdez', categoryId: DELIVERY, priority: 0 },
      ];
      expect(suggestCategory('Juan Valdez Cafe', { history: [], rules: rules })).toMatchObject({
        categoryId: DELIVERY,
      });
    });

    it('ignora patrones vacíos sin reventar', () => {
      const rules: CategoryRule[] = [{ pattern: '', categoryId: GROCERIES, priority: 99 }];
      expect(suggestCategory('Lo que sea', { history: [], rules: rules })).toBeNull();
    });
  });

  describe('tokensSignificativos', () => {
    it('descarta palabras de menos de tres letras', () => {
      expect([...significantTokens('d1 la 10 casa')]).toEqual(['casa']);
    });

    it('descarta palabras vacías de comercio', () => {
      expect([...significantTokens('exito de la 80 sas colombia')]).toEqual(['exito']);
    });

    it('descarta números sueltos, que suelen ser referencias', () => {
      expect([...significantTokens('terpel 998877')]).toEqual(['terpel']);
    });
  });
});

/** Un subconjunto de las reglas sembradas, para las pruebas. */
const RULES: CategoryRule[] = [
  { pattern: 'exito', categoryId: GROCERIES, priority: 0, isSeeded: true },
  { pattern: 'carulla', categoryId: GROCERIES, priority: 0, isSeeded: true },
  { pattern: 'rappi', categoryId: DELIVERY, priority: 0, isSeeded: true },
  { pattern: 'uber', categoryId: TRANSPORT, priority: 0, isSeeded: true },
];

/**
 * De qué se aprende y de qué no. «No aprendas de descripciones vacías o
 * genéricas» es lo que impide que una regla «pago → Mercado» convierta en
 * mercado cada «pago de» que llegue después.
 */
describe('El patrón con el que se aprende', () => {
  const normal = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  it('es el token más largo que no sea número', () => {
    expect(learnablePattern('RAPPI*RESTAURANTE EL SITIO 2025', normal)).toBe('restaurante');
  });

  it('de una descripción vacía no sale nada', () => {
    expect(learnablePattern('', normal)).toBeNull();
    expect(learnablePattern(null, normal)).toBeNull();
    expect(learnablePattern('   ', normal)).toBeNull();
  });

  it('de una descripción genérica tampoco', () => {
    expect(learnablePattern('Pago', normal)).toBeNull();
    expect(learnablePattern('pago factura servicios', normal)).toBeNull();
    expect(learnablePattern('Transferencia 12345', normal)).toBeNull();
  });

  it('pero una palabra genérica no esconde a la que sí dice algo', () => {
    expect(learnablePattern('Pago Netflix', normal)).toBe('netflix');
    expect(learnablePattern('compra en Carulla', normal)).toBe('carulla');
  });

  it('y las de menos de cuatro letras no cuentan', () => {
    expect(learnablePattern('D1 ARA', normal)).toBeNull();
  });
});
