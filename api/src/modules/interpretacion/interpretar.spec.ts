import type { SearchableNode } from '@coco/receipt-parser';

import { HISTORIAL_SEGURO, interpretar, pesos, resumenDe } from './interpretar';

/**
 * El cerebro, a solas: de un texto a un gasto interpretado, con la precedencia
 * del plan y sin adivinar.
 */
const ARBOL: SearchableNode[] = [
  {
    id: '2',
    name: 'Costos variables',
    children: [
      {
        id: '20',
        name: 'Alimentación',
        children: [
          { id: '200', name: 'Mercado', palabras_clave: [] },
          { id: '201', name: 'Restaurantes', palabras_clave: ['rappi'] },
        ],
      },
      { id: '21', name: 'Transporte', children: [] },
    ],
  },
];

const contexto = (historial: { categoryId: string; confidence: number } | null = null) => ({
  arbol: ARBOL,
  historial,
  hoy: '2026-10-04',
});

describe('Interpretar un texto', () => {
  it('un SMS de banco: saca el monto, la fecha y clasifica por el diccionario', () => {
    const r = interpretar(
      { texto: 'Compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234' },
      contexto(),
    );
    expect(r.monto).toBe('45000');
    expect(r.fecha).toBe('2026-10-03');
    expect(r.clasificacion).toMatchObject({
      certeza: 'alta',
      fuente: 'diccionario',
      conceptoId: '200',
      categoriaId: '20',
      nombre: 'Mercado',
    });
    expect(r.porRevisar).toBe(false);
  });

  it('las palabras clave de la persona le ganan al diccionario', () => {
    const r = interpretar({ texto: 'RAPPI*PEDIDO 32.000' }, contexto());
    expect(r.clasificacion).toMatchObject({
      fuente: 'palabras-clave',
      certeza: 'alta',
      conceptoId: '201',
    });
  });

  it('y el historial le gana a todo lo demás', () => {
    // El texto dice KOBA (mercado), pero el historial dice que esto va a
    // Restaurantes el 100% de las veces: manda el historial.
    const r = interpretar(
      { texto: 'KOBA COLOMBIA 45.000' },
      contexto({ categoryId: '201', confidence: 100 }),
    );
    expect(r.clasificacion).toMatchObject({
      fuente: 'historial',
      certeza: 'alta',
      conceptoId: '201',
    });
  });

  it('un historial repartido es certeza MEDIA: propone, pero a revisar', () => {
    const r = interpretar(
      { texto: 'KOBA COLOMBIA 45.000' },
      contexto({ categoryId: '201', confidence: HISTORIAL_SEGURO - 1 }),
    );
    expect(r.clasificacion.certeza).toBe('media');
    expect(r.clasificacion.fuente).toBe('historial');
    expect(r.porRevisar).toBe(true);
  });

  it('un comercio que lleva a una categoría sin conceptos: MEDIA con la categoría', () => {
    const r = interpretar({ texto: 'UBER *TRIP 18.500' }, contexto());
    expect(r.clasificacion).toMatchObject({
      certeza: 'media',
      fuente: 'diccionario',
      conceptoId: null,
      categoriaId: '21',
      nombre: 'Transporte',
    });
    expect(r.porRevisar).toBe(true);
  });

  it('un comercio desconocido: NINGUNA, y a revisar', () => {
    const r = interpretar({ texto: 'FERRETERIA LA ESQUINA 80.000' }, contexto());
    expect(r.clasificacion.certeza).toBe('ninguna');
    expect(r.clasificacion.conceptoId).toBeNull();
    expect(r.porRevisar).toBe(true);
  });

  it('sin monto o sin fecha, a revisar aunque la clasificación sea alta', () => {
    const r = interpretar({ texto: 'KOBA COLOMBIA' }, contexto());
    expect(r.clasificacion.certeza).toBe('alta');
    expect(r.monto).toBeNull();
    expect(r.porRevisar).toBe(true);
  });
});

describe('Interpretar datos estructurados (Wallet)', () => {
  it('lo estructurado manda: el monto y la fecha vienen dados, el comercio clasifica', () => {
    const r = interpretar(
      { comercio: 'Exito Poblado', monto: 120000, fecha: '2026-10-02' },
      contexto(),
    );
    expect(r.monto).toBe('120000');
    expect(r.fecha).toBe('2026-10-02');
    expect(r.comercio).toBe('Exito Poblado');
    expect(r.clasificacion).toMatchObject({ certeza: 'alta', conceptoId: '200' });
    expect(r.porRevisar).toBe(false);
  });

  it('Wallet a veces llega sin monto: se interpreta igual, y a revisar', () => {
    const r = interpretar({ comercio: 'Exito Poblado', fecha: '2026-10-02' }, contexto());
    expect(r.monto).toBeNull();
    expect(r.porRevisar).toBe(true);
  });

  it('una fecha futura o rota no se acepta', () => {
    expect(
      interpretar({ comercio: 'Exito', monto: 1, fecha: '2027-01-01' }, contexto()).fecha,
    ).toBeNull();
    expect(
      interpretar({ comercio: 'Exito', monto: 1, fecha: 'ayer' }, contexto()).fecha,
    ).toBeNull();
  });
});

describe('El resumen para la notificación', () => {
  const alta = {
    certeza: 'alta' as const,
    fuente: 'diccionario' as const,
    conceptoId: '200',
    categoriaId: '20',
    nombre: 'Mercado',
    candidatos: [],
    motivo: '',
  };

  it('tres palabras: qué, cuánto, dónde', () => {
    expect(resumenDe('45000', alta)).toBe('Registrado: $45.000 · Mercado');
  });

  it('con certeza media lo dice', () => {
    expect(resumenDe('18500', { ...alta, certeza: 'media', nombre: 'Transporte' })).toBe(
      'Registrado: $18.500 · Transporte (por revisar)',
    );
  });

  it('sin clasificación, pendiente', () => {
    expect(resumenDe('80000', { ...alta, certeza: 'ninguna', nombre: null })).toBe(
      'Registrado: $80.000 · Pendiente de clasificar',
    );
    expect(resumenDe(null, { ...alta, certeza: 'ninguna', nombre: null })).toBe(
      'Pendiente de clasificar',
    );
  });

  it('la plata se escribe como aquí', () => {
    expect(pesos('1200000')).toBe('$1.200.000');
    expect(pesos(45000.5)).toBe('$45.001');
  });
});
