import { describe, expect, it } from 'vitest';

import { classify, conceptSignatures, type SearchableNode } from '@coco/receipt-parser';

/**
 * El diccionario dentro de la lectura de un recibo, y su sitio en la fila.
 *
 * Tres cosas que no pueden fallar: que hable solo cuando nadie más reconoció
 * nada, que las palabras clave de la persona le ganen siempre, y que lo que
 * diga lleve ids y una certeza —porque es lo que la ficha necesita para
 * proponer sin adivinar—.
 */
const ARBOL: SearchableNode[] = [
  {
    id: 2,
    name: 'Costos variables',
    children: [
      {
        id: 20,
        name: 'Alimentación',
        children: [
          { id: 200, name: 'Mercado', palabras_clave: [] },
          { id: 201, name: 'Restaurantes', palabras_clave: ['rappi'] },
        ],
      },
      { id: 21, name: 'Transporte', children: [] },
      {
        id: 22,
        name: 'Hogar',
        children: [{ id: 220, name: 'Mercado', palabras_clave: [] }],
      },
    ],
  },
];

/** Las firmas que salen de las palabras clave de ESTE árbol. */
const firmasPropias = conceptSignatures([
  {
    concepto: 'Restaurantes',
    categoria: 'Alimentación',
    centro: 'Costos variables',
    palabras: ['rappi'],
  },
]);

const leer = (texto: string, arbol: SearchableNode[] = ARBOL) =>
  classify({ texto, fuente: 'texto-embebido', firmas: firmasPropias, arbol });

/** Sin árbol de verdad: la propiedad ni siquiera se pasa. */
const leerSinArbol = (texto: string) =>
  classify({ texto, fuente: 'texto-embebido', firmas: firmasPropias });

describe('El diccionario como última fuente de la lectura', () => {
  it('reconoce un comercio y lo lleva al concepto de la persona: certeza media aquí, porque hay dos «Mercado»', () => {
    // «Mercado» existe dos veces en este árbol —Alimentación y Hogar—, así
    // que el diccionario NO elige: deja los dos a la vista.
    const l = leer('KOBA COLOMBIA SAS Total 45.000');
    expect(l.enElArbol?.fuente).toBe('diccionario');
    expect(l.enElArbol?.certeza).toBe('media');
    expect(l.enElArbol?.conceptoId).toBeUndefined();
    expect(l.enElArbol?.candidatos.map((c) => c.id).sort()).toEqual([200, 220]);
    // Y la ruta de cada candidato es lo que distingue a uno del otro.
    expect(l.enElArbol?.candidatos.map((c) => c.ruta).sort()).toEqual([
      'Alimentación › Costos variables',
      'Hogar › Costos variables',
    ]);
  });

  it('con un solo destino, certeza alta y el id del concepto', () => {
    const unSoloMercado: SearchableNode[] = [
      {
        id: 2,
        name: 'Costos variables',
        children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
      },
    ];
    const l = leer('Compra en ARA cra 5', unSoloMercado);
    expect(l.enElArbol).toMatchObject({
      fuente: 'diccionario',
      certeza: 'alta',
      conceptoId: 200,
      categoriaId: 20,
    });
    expect(l.concepto).toBe('Mercado');
    expect(l.categoria).toBe('Alimentación');
    expect(l.centro).toBe('Costos variables');
  });

  it('nunca pasa del umbral de revisión: propone, no decide', () => {
    const unSoloMercado: SearchableNode[] = [
      {
        id: 2,
        name: 'Costos variables',
        children: [{ id: 20, name: 'Alimentación', children: [{ id: 200, name: 'Mercado' }] }],
      },
    ];
    const l = leer('EXITO Total a pagar 120.000', unSoloMercado);
    expect(l.enElArbol?.certeza).toBe('alta');
    expect(l.confianza).toBeLessThan(0.8);
  });

  it('lleva a una categoría sin conceptos: certeza media con la categoría', () => {
    const l = leer('UBER *TRIP 18.500');
    expect(l.enElArbol).toMatchObject({ fuente: 'diccionario', certeza: 'media', categoriaId: 21 });
    expect(l.enElArbol?.conceptoId).toBeUndefined();
    expect(l.categoria).toBe('Transporte');
  });

  it('las palabras clave de la persona le ganan al diccionario', () => {
    // «rappi» es palabra clave de «Restaurantes»: eso es una firma propia, y
    // una firma reconocida apaga al diccionario aunque RAPPI esté en él.
    const l = leer('RAPPI*PEDIDO 32.000');
    expect(l.enElArbol?.fuente).toBe('palabras-clave');
    expect(l.enElArbol?.certeza).toBe('alta');
    expect(l.enElArbol?.conceptoId).toBe(201);
    expect(l.concepto).toBe('Restaurantes');
  });

  it('un comercio desconocido no propone nada', () => {
    const l = leer('FERRETERIA LA ESQUINA 80.000');
    expect(l.enElArbol).toBeNull();
    expect(l.concepto).toBeNull();
  });

  it('sin el árbol, el diccionario no habla: no hay dónde buscar', () => {
    const l = leerSinArbol('KOBA COLOMBIA SAS');
    expect(l.enElArbol).toBeNull();
    expect(l.concepto).toBeNull();
  });
});
