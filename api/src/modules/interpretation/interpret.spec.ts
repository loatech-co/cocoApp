import type { SearchableNode } from '@coco/receipt-parser';

import { SAFE_HISTORY_CONFIDENCE, interpret, pesos, summaryOf } from './interpret';

/**
 * El cerebro, a solas: de un texto a un gasto interpretado, con la precedencia
 * del plan y sin adivinar.
 */
const TREE: SearchableNode[] = [
  {
    id: '2',
    name: 'Costos variables',
    children: [
      {
        id: '20',
        name: 'Alimentación',
        children: [
          { id: '200', name: 'Mercado', keywords: [] },
          { id: '201', name: 'Restaurantes', keywords: ['rappi'] },
        ],
      },
      { id: '21', name: 'Transporte', children: [] },
    ],
  },
];

const context = (history: { categoryId: string; confidence: number } | null = null) => ({
  tree: TREE,
  history,
  today: '2026-10-04',
});

describe('Interpretar un texto', () => {
  it('un SMS de banco: saca el monto, la fecha y clasifica por el diccionario', () => {
    const r = interpret(
      { text: 'Compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234' },
      context(),
    );
    expect(r.amount).toBe('45000');
    expect(r.date).toBe('2026-10-03');
    expect(r.classification).toMatchObject({
      certainty: 'alta',
      source: 'diccionario',
      conceptId: '200',
      categoryId: '20',
      name: 'Mercado',
    });
    expect(r.needsReview).toBe(false);
  });

  it('las palabras clave de la persona le ganan al diccionario', () => {
    const r = interpret({ text: 'RAPPI*PEDIDO 32.000' }, context());
    expect(r.classification).toMatchObject({
      source: 'palabras-clave',
      certainty: 'alta',
      conceptId: '201',
    });
  });

  it('y el historial le gana a todo lo demás', () => {
    // El texto dice KOBA (mercado), pero el historial dice que esto va a
    // Restaurantes el 100% de las veces: manda el historial.
    const r = interpret(
      { text: 'KOBA COLOMBIA 45.000' },
      context({ categoryId: '201', confidence: 100 }),
    );
    expect(r.classification).toMatchObject({
      source: 'historial',
      certainty: 'alta',
      conceptId: '201',
    });
  });

  it('un historial repartido es certeza MEDIA: propone, pero a revisar', () => {
    const r = interpret(
      { text: 'KOBA COLOMBIA 45.000' },
      context({ categoryId: '201', confidence: SAFE_HISTORY_CONFIDENCE - 1 }),
    );
    expect(r.classification.certainty).toBe('media');
    expect(r.classification.source).toBe('historial');
    expect(r.needsReview).toBe(true);
  });

  it('un comercio que lleva a una categoría sin conceptos: MEDIA con la categoría', () => {
    const r = interpret({ text: 'UBER *TRIP 18.500' }, context());
    expect(r.classification).toMatchObject({
      certainty: 'media',
      source: 'diccionario',
      conceptId: null,
      categoryId: '21',
      name: 'Transporte',
    });
    expect(r.needsReview).toBe(true);
  });

  it('un comercio desconocido: NINGUNA, y a revisar', () => {
    const r = interpret({ text: 'FERRETERIA LA ESQUINA 80.000' }, context());
    expect(r.classification.certainty).toBe('ninguna');
    expect(r.classification.conceptId).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it('sin monto o sin fecha, a revisar aunque la clasificación sea alta', () => {
    const r = interpret({ text: 'KOBA COLOMBIA' }, context());
    expect(r.classification.certainty).toBe('alta');
    expect(r.amount).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});

describe('Interpretar datos estructurados (Wallet)', () => {
  it('lo estructurado manda: el monto y la fecha vienen dados, el comercio clasifica', () => {
    const r = interpret(
      { merchant: 'Exito Poblado', amount: 120000, date: '2026-10-02' },
      context(),
    );
    expect(r.amount).toBe('120000');
    expect(r.date).toBe('2026-10-02');
    expect(r.merchant).toBe('Exito Poblado');
    expect(r.classification).toMatchObject({ certainty: 'alta', conceptId: '200' });
    expect(r.needsReview).toBe(false);
  });

  it('Wallet a veces llega sin amount: se interpreta igual, y a revisar', () => {
    const r = interpret({ merchant: 'Exito Poblado', date: '2026-10-02' }, context());
    expect(r.amount).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it('una fecha futura o rota no se acepta', () => {
    expect(
      interpret({ merchant: 'Exito', amount: 1, date: '2027-01-01' }, context()).date,
    ).toBeNull();
    expect(interpret({ merchant: 'Exito', amount: 1, date: 'ayer' }, context()).date).toBeNull();
  });
});

describe('El resumen para la notificación', () => {
  const high = {
    certainty: 'alta' as const,
    source: 'diccionario' as const,
    conceptId: '200',
    categoryId: '20',
    name: 'Mercado',
    candidates: [],
    reason: '',
  };

  it('tres palabras: qué, cuánto, dónde', () => {
    expect(summaryOf('45000', high)).toBe('Registrado: $45.000 · Mercado');
  });

  it('con certeza media lo dice', () => {
    expect(summaryOf('18500', { ...high, certainty: 'media', name: 'Transporte' })).toBe(
      'Registrado: $18.500 · Transporte (por revisar)',
    );
  });

  it('sin clasificación, pendiente', () => {
    expect(summaryOf('80000', { ...high, certainty: 'ninguna', name: null })).toBe(
      'Registrado: $80.000 · Pendiente de clasificar',
    );
    expect(summaryOf(null, { ...high, certainty: 'ninguna', name: null })).toBe(
      'Pendiente de clasificar',
    );
  });

  it('la plata se escribe como aquí', () => {
    expect(pesos('1200000')).toBe('$1.200.000');
    expect(pesos(45000.5)).toBe('$45.001');
  });
});
