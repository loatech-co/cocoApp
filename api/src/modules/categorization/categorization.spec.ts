import {
  CONFIANZA_MINIMA,
  sugerirCategoria,
  tokensSignificativos,
  type AntecedenteHistorico,
  type ReglaDeCategoria,
  patronParaAprender,
} from './categorization';

const DOMICILIOS = 10n;
const MERCADO = 20n;
const TRANSPORTE = 30n;

describe('Categorización automática (T1)', () => {
  const sinContexto = { historial: [], reglas: [] };

  describe('cuándo NO sugiere', () => {
    it.each<[string, string | null | undefined]>([
      ['vacía', ''],
      ['null', null],
      ['undefined', undefined],
    ])('devuelve null con una descripción %s', (_, descripcion) => {
      expect(sugerirCategoria(descripcion, sinContexto)).toBeNull();
    });

    it('devuelve null sin historial ni reglas', () => {
      expect(sugerirCategoria('Exito Poblado', sinContexto)).toBeNull();
    });

    it('devuelve null cuando la descripción es solo ruido', () => {
      expect(sugerirCategoria('REF 000123', { historial: [], reglas: REGLAS })).toBeNull();
    });

    it('calla cuando el historial está repartido y ninguna categoría domina', () => {
      // Sugerir mal es peor que no sugerir: una categoría equivocada que se
      // cuela sin mirar contamina los informes durante meses.
      const historial: AntecedenteHistorico[] = [
        { description: 'Rappi', categoryId: DOMICILIOS },
        { description: 'Rappi', categoryId: MERCADO },
        { description: 'Rappi', categoryId: TRANSPORTE },
      ];
      expect(sugerirCategoria('Rappi', { historial, reglas: [] })).toBeNull();
    });
  });

  describe('aprende del historial', () => {
    const historial: AntecedenteHistorico[] = [
      { description: 'RAPPI*RESTAURANTE', categoryId: DOMICILIOS },
      { description: 'Rappi Comida', categoryId: DOMICILIOS },
      { description: 'rappi ref 998877', categoryId: DOMICILIOS },
    ];

    it('sugiere lo que la persona ya viene clasificando', () => {
      const sugerencia = sugerirCategoria('RAPPI Domicilio', { historial, reglas: [] });
      expect(sugerencia).toMatchObject({ categoryId: DOMICILIOS, motivo: 'historial' });
      expect(sugerencia!.confidence).toBe(100);
    });

    it('ignora tildes, mayúsculas y ruido de referencia al comparar', () => {
      expect(sugerirCategoria('compra rappi REF 12345', { historial, reglas: [] })).toMatchObject({
        categoryId: DOMICILIOS,
      });
    });

    it('el historial GANA a las reglas sembradas', () => {
      // Las listas envejecen; el historial refleja cómo organiza SUS finanzas
      // esta persona, no las mías.
      const reglas: ReglaDeCategoria[] = [
        { pattern: 'rappi', categoryId: MERCADO, priority: 0, sembrada: true },
      ];
      expect(sugerirCategoria('Rappi', { historial, reglas })).toMatchObject({
        categoryId: DOMICILIOS,
        motivo: 'historial',
      });
    });

    it('no sugiere nada si ningún antecedente comparte palabras', () => {
      expect(sugerirCategoria('Terpel Calle 10', { historial, reglas: [] })).toBeNull();
    });

    it('la categoría dominante gana aunque haya algo de ruido', () => {
      const mezclado: AntecedenteHistorico[] = [
        ...historial,
        { description: 'Rappi', categoryId: MERCADO },
      ];
      const sugerencia = sugerirCategoria('Rappi', { historial: mezclado, reglas: [] });
      expect(sugerencia).toMatchObject({ categoryId: DOMICILIOS });
      expect(sugerencia!.confidence).toBeGreaterThanOrEqual(CONFIANZA_MINIMA);
      expect(sugerencia!.confidence).toBeLessThan(100);
    });
  });

  describe('reglas por palabra clave', () => {
    it('sugiere desde una regla sembrada, con confianza moderada', () => {
      const sugerencia = sugerirCategoria('EXITO POBLADO', { historial: [], reglas: REGLAS });
      expect(sugerencia).toMatchObject({ categoryId: MERCADO, motivo: 'regla-sembrada' });
      // Moderada a propósito: una regla sembrada es una suposición nuestra.
      expect(sugerencia!.confidence).toBe(60);
    });

    it('una regla propia pesa más que una sembrada', () => {
      const reglas: ReglaDeCategoria[] = [
        { pattern: 'exito', categoryId: MERCADO, priority: 0, sembrada: true },
        { pattern: 'exito', categoryId: DOMICILIOS, priority: 10 },
      ];
      const sugerencia = sugerirCategoria('Exito Poblado', { historial: [], reglas });
      expect(sugerencia).toMatchObject({ categoryId: DOMICILIOS, motivo: 'regla' });
      expect(sugerencia!.confidence).toBe(85);
    });

    it('a igual prioridad gana el patrón más específico', () => {
      const reglas: ReglaDeCategoria[] = [
        { pattern: 'juan', categoryId: MERCADO, priority: 0 },
        { pattern: 'juan valdez', categoryId: DOMICILIOS, priority: 0 },
      ];
      expect(sugerirCategoria('Juan Valdez Cafe', { historial: [], reglas })).toMatchObject({
        categoryId: DOMICILIOS,
      });
    });

    it('ignora patrones vacíos sin reventar', () => {
      const reglas: ReglaDeCategoria[] = [{ pattern: '', categoryId: MERCADO, priority: 99 }];
      expect(sugerirCategoria('Lo que sea', { historial: [], reglas })).toBeNull();
    });
  });

  describe('tokensSignificativos', () => {
    it('descarta palabras de menos de tres letras', () => {
      expect([...tokensSignificativos('d1 la 10 casa')]).toEqual(['casa']);
    });

    it('descarta palabras vacías de comercio', () => {
      expect([...tokensSignificativos('exito de la 80 sas colombia')]).toEqual(['exito']);
    });

    it('descarta números sueltos, que suelen ser referencias', () => {
      expect([...tokensSignificativos('terpel 998877')]).toEqual(['terpel']);
    });
  });
});

/** Un subconjunto de las reglas sembradas, para las pruebas. */
const REGLAS: ReglaDeCategoria[] = [
  { pattern: 'exito', categoryId: MERCADO, priority: 0, sembrada: true },
  { pattern: 'carulla', categoryId: MERCADO, priority: 0, sembrada: true },
  { pattern: 'rappi', categoryId: DOMICILIOS, priority: 0, sembrada: true },
  { pattern: 'uber', categoryId: TRANSPORTE, priority: 0, sembrada: true },
];

/**
 * De qué se aprende y de qué no. «No aprendas de descripciones vacías o
 * genéricas» es lo que impide que una regla «pago → Mercado» convierta en
 * mercado cada «pago de» que llegue después.
 */
describe('El patrón con el que se aprende', () => {
  const normal = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  it('es el token más largo que no sea número', () => {
    expect(patronParaAprender('RAPPI*RESTAURANTE EL SITIO 2025', normal)).toBe('restaurante');
  });

  it('de una descripción vacía no sale nada', () => {
    expect(patronParaAprender('', normal)).toBeNull();
    expect(patronParaAprender(null, normal)).toBeNull();
    expect(patronParaAprender('   ', normal)).toBeNull();
  });

  it('de una descripción genérica tampoco', () => {
    expect(patronParaAprender('Pago', normal)).toBeNull();
    expect(patronParaAprender('pago factura servicios', normal)).toBeNull();
    expect(patronParaAprender('Transferencia 12345', normal)).toBeNull();
  });

  it('pero una palabra genérica no esconde a la que sí dice algo', () => {
    expect(patronParaAprender('Pago Netflix', normal)).toBe('netflix');
    expect(patronParaAprender('compra en Carulla', normal)).toBe('carulla');
  });

  it('y las de menos de cuatro letras no cuentan', () => {
    expect(patronParaAprender('D1 ARA', normal)).toBeNull();
  });
});
